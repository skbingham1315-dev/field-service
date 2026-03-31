import { Router, Request, Response } from 'express';
import express from 'express';
import Stripe from 'stripe';
import { prisma } from '@fsp/db';
import { logger } from '../lib/logger';
import { saveInboundSms } from '../lib/sms';
import { io } from '../socket';

export const webhooksRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

webhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature header');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', { err });
    return res.status(400).send('Webhook signature verification failed');
  }

  const PRICE_TO_PLAN: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER ?? '']: 'starter',
    [process.env.STRIPE_PRICE_PROFESSIONAL ?? '']: 'professional',
    [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
  };

  switch (event.type) {
    // ── Job invoice payments ──────────────────────────────────────────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      if (invoiceId) {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'paid', amountPaid: pi.amount_received, amountDue: 0, paidAt: new Date() },
        });
        await prisma.payment.create({
          data: {
            tenantId: pi.metadata.tenantId,
            invoiceId,
            amount: pi.amount_received,
            method: 'stripe',
            stripePaymentIntentId: pi.id,
            paidAt: new Date(),
          },
        });
      }
      break;
    }

    // ── Subscription checkout completed ──────────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break;
      const tenantId = session.metadata?.tenantId;
      if (!tenantId) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan = PRICE_TO_PLAN[priceId] ?? 'starter';

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          plan: plan as never,
          status: sub.status === 'trialing' ? 'trial' : 'active',
        },
      });
      logger.info(`Tenant ${tenantId} subscribed to ${plan}`);
      break;
    }

    // ── Subscription updated (plan change, renewal) ───────────────────────────
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;

      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan = PRICE_TO_PLAN[priceId] ?? 'starter';
      const status = sub.status === 'active' ? 'active'
        : sub.status === 'trialing' ? 'trial'
        : sub.status === 'past_due' ? 'suspended'
        : 'active';

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: plan as never, status: status as never },
      });
      io?.to(`tenant:${tenantId}`).emit('billing:updated', { plan, status });
      break;
    }

    // ── Subscription cancelled ────────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'cancelled', stripeSubscriptionId: null },
      });
      io?.to(`tenant:${tenantId}`).emit('billing:updated', { status: 'cancelled' });
      break;
    }

    // ── Subscription payment failed ───────────────────────────────────────────
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = inv.customer as string;
      if (customerId) {
        await prisma.tenant.updateMany({
          where: { stripeCustomerId: customerId },
          data: { status: 'suspended' },
        });
      }
      logger.warn('Subscription payment failed', { customerId });
      break;
    }

    case 'payment_intent.payment_failed':
      logger.warn('Payment intent failed', { id: (event.data.object as Stripe.PaymentIntent).id });
      break;

    default:
      logger.debug(`Unhandled Stripe event: ${event.type}`);
  }

  res.json({ received: true });
});

// ── Twilio Inbound SMS ────────────────────────────────────────────────────────

webhooksRouter.post('/twilio/sms', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  const { From, To, Body, MessageSid } = req.body as {
    From: string;
    To: string;
    Body: string;
    MessageSid: string;
  };

  // Find customer by phone number (any tenant)
  const customer = await prisma.customer.findFirst({
    where: { phone: From },
    include: { tenant: true },
  });

  if (customer) {
    await saveInboundSms({
      tenantId: customer.tenantId,
      customerId: customer.id,
      from: From,
      to: To,
      body: Body,
      twilioSid: MessageSid,
    });

    // Broadcast to dispatchers in real-time
    io?.to(`tenant:${customer.tenantId}`).emit('sms:received', {
      customerId: customer.id,
      from: From,
      body: Body,
      createdAt: new Date().toISOString(),
    });
  } else {
    logger.warn('[twilio] inbound SMS from unknown number', { From });
  }

  // Always respond 200 with empty TwiML so Twilio doesn't retry
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});
