import { Router } from 'express';
import { prisma } from '@fsp/db';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { AppError } from '../middleware/errorHandler';
import { signAccessToken, signRefreshToken, verifyRefreshToken, buildTokenPayload } from '../lib/jwt';
import type { ApiResponse } from '@fsp/types';
import type { UserRole } from '@fsp/types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

const PRICE_MAP: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? '',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL ?? '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
};

export const authRouter = Router();

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password, tenantSlug } = req.body as {
    email: string;
    password: string;
    tenantSlug: string;
  };

  if (!email || !password || !tenantSlug) {
    throw new AppError('email, password, and tenantSlug are required', 400, 'VALIDATION_ERROR');
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug.toLowerCase().trim() } });
  if (!tenant) throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase().trim() } },
  });
  if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  if (user.status !== 'active') {
    throw new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const payload = buildTokenPayload({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    secondaryRoles: user.secondaryRoles,
    email: user.email,
  });
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  // Store hashed refresh token
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: refreshHash } });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
    },
  } satisfies ApiResponse);
});

// POST /api/v1/auth/register — create new tenant + owner account
authRouter.post('/register', async (req, res) => {
  const { companyName, slug, firstName, lastName, email, password, plan } = req.body as {
    companyName: string;
    slug: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    plan: string;
  };

  if (!companyName || !slug || !firstName || !lastName || !email || !password) {
    throw new AppError('All fields are required', 400, 'VALIDATION_ERROR');
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!slugClean) throw new AppError('Invalid company slug', 400, 'VALIDATION_ERROR');

  const existing = await prisma.tenant.findUnique({ where: { slug: slugClean } });
  if (existing) throw new AppError('That company URL is already taken', 409, 'SLUG_TAKEN');

  const validPlans = ['starter', 'professional', 'enterprise'];
  const selectedPlan = validPlans.includes(plan) ? plan : 'starter';

  const passwordHash = await bcrypt.hash(password, 12);

  // Create Stripe customer
  let stripeCustomerId: string | undefined;
  try {
    const customer = await stripe.customers.create({
      email,
      name: `${firstName} ${lastName}`,
      metadata: { companyName, slug: slugClean },
    });
    stripeCustomerId = customer.id;
  } catch { /* non-fatal — billing can be set up later */ }

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      slug: slugClean,
      plan: selectedPlan as never,
      status: 'trial',
      stripeCustomerId: stripeCustomerId ?? null,
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      firstName,
      lastName,
      passwordHash,
      role: 'owner',
      status: 'active',
    },
  });

  const tokenPayload = buildTokenPayload({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    secondaryRoles: [],
    email: user.email,
  });
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(user.id);
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: refreshHash } });

  // Create Stripe Checkout session so user can enter payment details
  let checkoutUrl: string | null = null;
  const priceId = PRICE_MAP[selectedPlan];
  const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
  if (stripeCustomerId && priceId) {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${webUrl}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${webUrl}?billing=cancelled`,
        metadata: { tenantId: tenant.id, plan: selectedPlan },
        subscription_data: { trial_period_days: 14, metadata: { tenantId: tenant.id, plan: selectedPlan } },
        payment_method_collection: 'always', // require card upfront even during trial
        allow_promotion_codes: true,
      });
      checkoutUrl = session.url;
    } catch { /* non-fatal */ }
  }

  res.status(201).json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      checkoutUrl,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
    },
  } satisfies ApiResponse);
});

// POST /api/v1/auth/check-slug — check if slug is available
authRouter.post('/check-slug', async (req, res) => {
  const { slug } = req.body as { slug: string };
  const slugClean = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const existing = await prisma.tenant.findUnique({ where: { slug: slugClean } });
  res.json({ success: true, data: { available: !existing, slug: slugClean } } satisfies ApiResponse);
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) throw new AppError('refreshToken required', 400, 'VALIDATION_ERROR');

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.refreshTokenHash) throw new AppError('Session expired', 401, 'SESSION_EXPIRED');

  const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!valid) throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');

  const tokenPayload = buildTokenPayload({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    secondaryRoles: user.secondaryRoles,
    email: user.email,
  });
  const newAccessToken = signAccessToken(tokenPayload);

  res.json({ success: true, data: { accessToken: newAccessToken } } satisfies ApiResponse);
});

// POST /api/v1/auth/logout
authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.user.update({
        where: { id: payload.sub },
        data: { refreshTokenHash: null },
      });
    } catch {
      // ignore invalid token on logout
    }
  }
  res.json({ success: true, data: { message: 'Logged out' } } satisfies ApiResponse);
});
