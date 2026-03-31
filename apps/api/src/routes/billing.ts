import { Router } from 'express';
import Stripe from 'stripe';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const billingRouter = Router();
billingRouter.use(authenticate);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

const PRICE_MAP: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? '',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL ?? '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
};

const PRICE_TO_PLAN: Record<string, string> = Object.fromEntries(
  Object.entries(PRICE_MAP).map(([plan, price]) => [price, plan])
);

// GET /api/v1/billing/status
billingRouter.get('/status', requireRole('owner', 'admin'), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { plan: true, status: true, stripeCustomerId: true, stripeSubscriptionId: true, name: true },
  });
  if (!tenant) { res.status(404).json({ success: false, message: 'Tenant not found' }); return; }

  let subscription: Stripe.Subscription | null = null;
  if (tenant.stripeSubscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId, {
        expand: ['default_payment_method'],
      });
    } catch { /* expired/invalid — ignore */ }
  }

  // Check if customer has any saved payment method
  let hasPaymentMethod = false;
  if (tenant.stripeCustomerId) {
    try {
      // Check default payment method on subscription first
      const sub = subscription as unknown as { default_payment_method?: object | null } | null;
      if (sub?.default_payment_method) {
        hasPaymentMethod = true;
      } else {
        // Fall back to listing customer payment methods
        const methods = await stripe.paymentMethods.list({ customer: tenant.stripeCustomerId, type: 'card', limit: 1 });
        hasPaymentMethod = methods.data.length > 0;
      }
    } catch { /* ignore */ }
  }

  res.json({
    success: true,
    data: {
      plan: tenant.plan,
      status: tenant.status,
      stripeStatus: subscription?.status ?? null,
      stripeCustomerId: tenant.stripeCustomerId ?? null,
      currentPeriodEnd: subscription ? new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: (subscription as unknown as { cancel_at_period_end?: boolean } | null)?.cancel_at_period_end ?? false,
      hasPaymentMethod,
    },
  } satisfies ApiResponse);
});

// POST /api/v1/billing/checkout — create checkout session (new sub or upgrade)
billingRouter.post('/checkout', requireRole('owner', 'admin'), async (req, res) => {
  const { plan, successUrl, cancelUrl } = req.body as { plan: string; successUrl: string; cancelUrl: string };
  const priceId = PRICE_MAP[plan];
  if (!priceId) { res.status(400).json({ success: false, message: 'Invalid plan' }); return; }

  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true, name: true },
  });
  if (!tenant) { res.status(404).json({ success: false, message: 'Tenant not found' }); return; }

  // If already subscribed, send to portal with subscription_update flow pre-selected
  if (tenant.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      const currentItemId = sub.items.data[0]?.id;
      const portal = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId!,
        return_url: successUrl,
        flow_data: currentItemId && priceId ? {
          type: 'subscription_update',
          subscription_update: {
            subscription: tenant.stripeSubscriptionId,
          },
        } : undefined,
      } as Parameters<typeof stripe.billingPortal.sessions.create>[0]);
      res.json({ success: true, data: { url: portal.url } } satisfies ApiResponse);
    } catch {
      // fall back to plain portal
      const portal = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId!,
        return_url: successUrl,
      });
      res.json({ success: true, data: { url: portal.url } } satisfies ApiResponse);
    }
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: tenant.stripeCustomerId ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cancelUrl}?billing=cancelled`,
    metadata: { tenantId: req.user!.tenantId, plan },
    subscription_data: { trial_period_days: 14, metadata: { tenantId: req.user!.tenantId, plan } },
    payment_method_collection: 'always', // require card even during trial
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  });

  res.json({ success: true, data: { url: session.url } } satisfies ApiResponse);
});

// POST /api/v1/billing/portal — customer portal for plan changes, payment method, invoices
billingRouter.post('/portal', requireRole('owner', 'admin'), async (req, res) => {
  const { returnUrl } = req.body as { returnUrl: string };
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { stripeCustomerId: true },
  });
  if (!tenant?.stripeCustomerId) {
    res.status(400).json({ success: false, message: 'No billing account found. Please subscribe first.' });
    return;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: returnUrl,
  });

  res.json({ success: true, data: { url: session.url } } satisfies ApiResponse);
});

// POST /api/v1/billing/setup-payment — collect/update payment method without charging
billingRouter.post('/setup-payment', requireRole('owner', 'admin'), async (req, res) => {
  const { returnUrl } = req.body as { returnUrl: string };
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!tenant) { res.status(404).json({ success: false, message: 'Tenant not found' }); return; }

  // Prefer portal if they have an existing subscription (cleanest UX)
  if (tenant.stripeCustomerId && tenant.stripeSubscriptionId) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });
    res.json({ success: true, data: { url: portal.url } } satisfies ApiResponse);
    return;
  }

  // No subscription yet — use a Checkout setup session to collect card only
  if (!tenant.stripeCustomerId) {
    res.status(400).json({ success: false, message: 'No billing account found.' }); return;
  }

  const setupSession = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: tenant.stripeCustomerId,
    success_url: `${returnUrl}?billing=payment_added`,
    cancel_url: returnUrl,
  });
  res.json({ success: true, data: { url: setupSession.url } } satisfies ApiResponse);
});
