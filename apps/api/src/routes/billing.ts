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
      subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
    } catch { /* expired/invalid — ignore */ }
  }

  res.json({
    success: true,
    data: {
      plan: tenant.plan,
      status: tenant.status,
      stripeStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription ? new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: (subscription as unknown as { cancel_at_period_end?: boolean } | null)?.cancel_at_period_end ?? false,
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

  // If already subscribed, redirect to portal instead
  if (tenant.stripeSubscriptionId) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId!,
      return_url: successUrl,
    });
    res.json({ success: true, data: { url: portal.url } } satisfies ApiResponse);
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
