/**
 * FieldOps Connect — Customer Portal API
 *
 * Public routes (no JWT):
 *   POST /portal/auth/magic-link   — send magic link to email
 *   GET  /portal/auth/verify       — verify magic link token → issue session JWT
 *   POST /portal/auth/otp/send     — send SMS OTP
 *   POST /portal/auth/otp/verify   — verify OTP → issue session JWT
 *
 * Portal-auth routes (portal session JWT):
 *   GET  /portal/me                — portal user profile + linked customer info
 *   GET  /portal/invoices          — customer invoices
 *   GET  /portal/jobs              — service history (CRM jobs)
 *   POST /portal/work-requests     — submit work request
 *   GET  /portal/work-requests     — list own work requests
 *   GET  /portal/messages          — conversation thread
 *   POST /portal/messages          — send message
 *   PATCH /portal/messages/read    — mark messages read
 *
 * Admin routes (tenant JWT, owner/admin):
 *   GET    /portal/config          — get portal config
 *   PUT    /portal/config          — upsert portal config
 *   GET    /portal/users           — list portal users
 *   POST   /portal/users           — invite portal user
 *   DELETE /portal/users/:id       — deactivate portal user
 *   GET    /portal/admin/messages  — all message threads
 *   POST   /portal/admin/messages  — reply to customer
 *   GET    /portal/admin/work-requests — all work requests
 *   PATCH  /portal/admin/work-requests/:id — update status
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@fsp/db';
import { authenticate, requireRole } from '../middleware/authenticate';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export const portalRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET ?? JWT_SECRET + '_portal';
const MAGIC_LINK_EXPIRY_MINS = 15;
const OTP_EXPIRY_MINS = 10;

// ─── Helper: issue portal session JWT ────────────────────────────────────────

function issuePortalJWT(portalUserId: string, tenantId: string): string {
  return jwt.sign(
    { sub: portalUserId, tenantId, type: 'portal' },
    PORTAL_JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// ─── Middleware: verify portal JWT ────────────────────────────────────────────

async function portalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), PORTAL_JWT_SECRET) as {
      sub: string;
      tenantId: string;
      type: string;
    };
    if (payload.type !== 'portal') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: payload.sub },
      include: { tenant: { include: { portalConfig: true } } },
    });
    if (!portalUser || !portalUser.isActive) {
      res.status(401).json({ error: 'Portal user inactive or not found' });
      return;
    }
    (req as any).portalUser = portalUser;
    (req as any).tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Helper: send magic link email ───────────────────────────────────────────

async function sendMagicLinkEmail(
  to: string,
  token: string,
  portalName: string,
  baseUrl: string,
): Promise<void> {
  const link = `${baseUrl}/portal/verify?token=${token}`;
  // Use nodemailer with SMTP env vars if available; otherwise log to console
  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `noreply@${process.env.APP_DOMAIN ?? 'fieldops.app'}`,
      to,
      subject: `Sign in to ${portalName}`,
      text: `Click this link to sign in: ${link}\n\nThis link expires in ${MAGIC_LINK_EXPIRY_MINS} minutes.`,
      html: `<p>Click the button below to sign in to <strong>${portalName}</strong>:</p>
             <p><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Sign In</a></p>
             <p style="color:#6b7280;font-size:14px">This link expires in ${MAGIC_LINK_EXPIRY_MINS} minutes. If you did not request this, ignore this email.</p>`,
    });
  } else {
    // Dev mode: log link
    console.log(`[Portal Magic Link] To: ${to} → ${link}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /portal/auth/magic-link
portalRouter.post('/auth/magic-link', async (req: Request, res: Response): Promise<void> => {
  const { email, tenantSlug } = req.body as { email?: string; tenantSlug?: string };
  if (!email || !tenantSlug) {
    res.status(400).json({ error: 'email and tenantSlug are required' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { portalConfig: true },
  });
  if (!tenant?.portalConfig?.isEnabled) {
    res.status(404).json({ error: 'Portal not found or not enabled' });
    return;
  }
  if (!tenant.portalConfig.allowMagicLink) {
    res.status(400).json({ error: 'Magic link auth is not enabled for this portal' });
    return;
  }

  // Upsert portal user
  let portalUser = await prisma.portalUser.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!portalUser) {
    // Try to find matching customer
    const customer = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, email },
    });
    portalUser = await prisma.portalUser.create({
      data: {
        tenantId: tenant.id,
        email,
        customerId: customer?.id ?? null,
        displayName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : email,
      },
    });
  }

  if (!portalUser.isActive) {
    res.status(403).json({ error: 'Your portal access has been deactivated' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINS * 60 * 1000);

  await prisma.portalSession.create({
    data: {
      portalUserId: portalUser.id,
      token,
      type: 'magic_link',
      expiresAt,
    },
  });

  const baseUrl = process.env.WEB_URL ?? 'http://localhost:5173';
  await sendMagicLinkEmail(email, token, tenant.portalConfig.portalName, baseUrl);

  res.json({ message: 'Magic link sent. Check your email.' });
});

// GET /portal/auth/verify?token=xxx
portalRouter.get('/auth/verify', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const session = await prisma.portalSession.findUnique({
    where: { token },
    include: { portalUser: true },
  });

  if (!session || session.usedAt || session.expiresAt < new Date()) {
    res.status(401).json({ error: 'Invalid or expired link' });
    return;
  }

  await prisma.portalSession.update({ where: { id: session.id }, data: { usedAt: new Date() } });
  await prisma.portalUser.update({
    where: { id: session.portalUser.id },
    data: { lastLoginAt: new Date() },
  });

  const jwt_token = issuePortalJWT(session.portalUser.id, session.portalUser.tenantId);
  res.json({ token: jwt_token, portalUserId: session.portalUser.id });
});

// POST /portal/auth/otp/send
portalRouter.post('/auth/otp/send', async (req: Request, res: Response): Promise<void> => {
  const { phone, tenantSlug } = req.body as { phone?: string; tenantSlug?: string };
  if (!phone || !tenantSlug) {
    res.status(400).json({ error: 'phone and tenantSlug are required' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { portalConfig: true },
  });
  if (!tenant?.portalConfig?.isEnabled || !tenant.portalConfig.allowSmsOtp) {
    res.status(400).json({ error: 'SMS OTP not enabled for this portal' });
    return;
  }

  // Upsert portal user by phone
  let portalUser = await prisma.portalUser.findFirst({
    where: { tenantId: tenant.id, phone },
  });
  if (!portalUser) {
    res.status(404).json({ error: 'No account found for that phone number' });
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINS * 60 * 1000);

  await prisma.portalSession.create({
    data: {
      portalUserId: portalUser.id,
      token: crypto.randomBytes(16).toString('hex'),
      type: 'otp',
      otp,
      expiresAt,
    },
  });

  // In production, send via Twilio Verify or similar
  console.log(`[Portal OTP] To: ${phone} → ${otp}`);

  res.json({ message: 'OTP sent to your phone' });
});

// POST /portal/auth/otp/verify
portalRouter.post('/auth/otp/verify', async (req: Request, res: Response): Promise<void> => {
  const { phone, otp, tenantSlug } = req.body as {
    phone?: string;
    otp?: string;
    tenantSlug?: string;
  };
  if (!phone || !otp || !tenantSlug) {
    res.status(400).json({ error: 'phone, otp, and tenantSlug are required' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const portalUser = await prisma.portalUser.findFirst({
    where: { tenantId: tenant.id, phone },
  });
  if (!portalUser) {
    res.status(404).json({ error: 'No account found' });
    return;
  }

  const session = await prisma.portalSession.findFirst({
    where: {
      portalUserId: portalUser.id,
      type: 'otp',
      otp,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired OTP' });
    return;
  }

  await prisma.portalSession.update({ where: { id: session.id }, data: { usedAt: new Date() } });
  await prisma.portalUser.update({
    where: { id: portalUser.id },
    data: { lastLoginAt: new Date() },
  });

  const jwt_token = issuePortalJWT(portalUser.id, portalUser.tenantId);
  res.json({ token: jwt_token, portalUserId: portalUser.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PORTAL USER ROUTES (authenticated customer)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /portal/me
portalRouter.get('/me', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  const customer = portalUser.customerId
    ? await prisma.customer.findUnique({
        where: { id: portalUser.customerId },
        include: { serviceAddresses: true },
      })
    : null;

  res.json({
    id: portalUser.id,
    email: portalUser.email,
    phone: portalUser.phone,
    displayName: portalUser.displayName,
    customer,
    portalName: portalUser.tenant.portalConfig?.portalName ?? 'Customer Portal',
    config: {
      primaryColor: portalUser.tenant.portalConfig?.primaryColor ?? '#2563eb',
      logoUrl: portalUser.tenant.portalConfig?.logoUrl,
      enableBilling: portalUser.tenant.portalConfig?.enableBilling ?? true,
      enableWorkRequests: portalUser.tenant.portalConfig?.enableWorkRequests ?? true,
      enableMessaging: portalUser.tenant.portalConfig?.enableMessaging ?? true,
    },
  });
});

// GET /portal/invoices
portalRouter.get('/invoices', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  if (!portalUser.customerId) {
    res.json([]);
    return;
  }
  const invoices = await prisma.invoice.findMany({
    where: { customerId: portalUser.customerId },
    include: { lineItems: true, payments: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(invoices);
});

// GET /portal/jobs
portalRouter.get('/jobs', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  if (!portalUser.customerId) {
    res.json([]);
    return;
  }
  const jobs = await prisma.cRMJob.findMany({
    where: { tenantId: portalUser.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  // Fallback to regular jobs
  const serviceJobs = await prisma.job.findMany({
    where: { customerId: portalUser.customerId },
    include: { serviceAddress: true },
    orderBy: { scheduledStart: 'desc' },
    take: 50,
  });
  res.json({ crmJobs: jobs, serviceJobs });
});

// POST /portal/work-requests
portalRouter.post(
  '/work-requests',
  portalAuth,
  async (req: Request, res: Response): Promise<void> => {
    const portalUser = (req as any).portalUser;
    const { title, description, serviceAddress, category, urgency, photoUrls } = req.body as {
      title?: string;
      description?: string;
      serviceAddress?: string;
      category?: string;
      urgency?: string;
      photoUrls?: string[];
    };
    if (!title || !description) {
      res.status(400).json({ error: 'title and description are required' });
      return;
    }
    const request = await prisma.portalWorkRequest.create({
      data: {
        tenantId: portalUser.tenantId,
        portalUserId: portalUser.id,
        title,
        description,
        serviceAddress,
        category,
        urgency: urgency ?? 'normal',
        photoUrls: photoUrls ?? [],
      },
    });
    res.status(201).json(request);
  },
);

// GET /portal/work-requests
portalRouter.get(
  '/work-requests',
  portalAuth,
  async (req: Request, res: Response): Promise<void> => {
    const portalUser = (req as any).portalUser;
    const requests = await prisma.portalWorkRequest.findMany({
      where: { portalUserId: portalUser.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  },
);

// GET /portal/messages
portalRouter.get('/messages', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  const messages = await prisma.portalMessage.findMany({
    where: { portalUserId: portalUser.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  // Mark inbound messages (from team) as read
  await prisma.portalMessage.updateMany({
    where: { portalUserId: portalUser.id, fromPortal: false, isRead: false },
    data: { isRead: true },
  });
  res.json(messages);
});

// POST /portal/messages
portalRouter.post('/messages', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  const { body } = req.body as { body?: string };
  if (!body?.trim()) {
    res.status(400).json({ error: 'body is required' });
    return;
  }
  const message = await prisma.portalMessage.create({
    data: {
      tenantId: portalUser.tenantId,
      portalUserId: portalUser.id,
      fromPortal: true,
      senderName: portalUser.displayName ?? portalUser.email,
      body: body.trim(),
    },
  });
  res.status(201).json(message);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (tenant team member, owner/admin)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /portal/config
portalRouter.get(
  '/config',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const config = await prisma.portalConfig.findUnique({ where: { tenantId } });
    res.json(config ?? { tenantId, isEnabled: false });
  },
);

// PUT /portal/config
portalRouter.put(
  '/config',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const {
      isEnabled,
      portalName,
      logoUrl,
      primaryColor,
      customDomain,
      enableBilling,
      enableWorkRequests,
      enableMessaging,
      enableDocuments,
      allowMagicLink,
      allowSmsOtp,
      notifyOnJobUpdate,
      notifyOnInvoice,
      notifyOnMessage,
    } = req.body;

    const config = await prisma.portalConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        isEnabled: isEnabled ?? false,
        portalName,
        logoUrl,
        primaryColor,
        customDomain,
        enableBilling,
        enableWorkRequests,
        enableMessaging,
        enableDocuments,
        allowMagicLink,
        allowSmsOtp,
        notifyOnJobUpdate,
        notifyOnInvoice,
        notifyOnMessage,
      },
      update: {
        isEnabled,
        portalName,
        logoUrl,
        primaryColor,
        customDomain,
        enableBilling,
        enableWorkRequests,
        enableMessaging,
        enableDocuments,
        allowMagicLink,
        allowSmsOtp,
        notifyOnJobUpdate,
        notifyOnInvoice,
        notifyOnMessage,
      },
    });
    res.json(config);
  },
);

// GET /portal/users (admin)
portalRouter.get(
  '/users',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const users = await prisma.portalUser.findMany({
      where: { tenantId },
      include: { customer: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  },
);

// POST /portal/users (admin — invite / create portal user)
portalRouter.post(
  '/users',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const { email, phone, displayName, customerId } = req.body as {
      email?: string;
      phone?: string;
      displayName?: string;
      customerId?: string;
    };
    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const existing = await prisma.portalUser.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (existing) {
      res.status(409).json({ error: 'Portal user with this email already exists' });
      return;
    }

    const user = await prisma.portalUser.create({
      data: { tenantId, email, phone, displayName, customerId },
    });
    res.status(201).json(user);
  },
);

// PATCH /portal/users/:id (admin)
portalRouter.patch(
  '/users/:id',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const { isActive, displayName, customerId, phone } = req.body;
    const user = await prisma.portalUser.updateMany({
      where: { id: req.params.id, tenantId },
      data: { isActive, displayName, customerId, phone },
    });
    if (!user.count) {
      res.status(404).json({ error: 'Portal user not found' });
      return;
    }
    res.json({ success: true });
  },
);

// DELETE /portal/users/:id (admin — deactivate)
portalRouter.delete(
  '/users/:id',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    await prisma.portalUser.updateMany({
      where: { id: req.params.id, tenantId },
      data: { isActive: false },
    });
    res.json({ success: true });
  },
);

// GET /portal/admin/messages (admin — all threads)
portalRouter.get(
  '/admin/messages',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    // Get latest message per portalUser
    const users = await prisma.portalUser.findMany({
      where: { tenantId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        customer: { select: { firstName: true, lastName: true } },
      },
    });
    const threads = users
      .filter((u) => u.messages.length > 0)
      .map((u) => ({
        portalUserId: u.id,
        email: u.email,
        displayName: u.displayName,
        customer: u.customer,
        lastMessage: u.messages[0],
        unreadCount: 0, // computed below
      }));

    // Count unread (from portal, not yet replied to)
    for (const t of threads) {
      const unread = await prisma.portalMessage.count({
        where: { portalUserId: t.portalUserId, fromPortal: true, isRead: false },
      });
      t.unreadCount = unread;
    }

    res.json(threads);
  },
);

// GET /portal/admin/messages/:portalUserId (admin — single thread)
portalRouter.get(
  '/admin/messages/:portalUserId',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const messages = await prisma.portalMessage.findMany({
      where: { tenantId, portalUserId: req.params.portalUserId },
      orderBy: { createdAt: 'asc' },
    });
    // Mark customer messages as read
    await prisma.portalMessage.updateMany({
      where: { tenantId, portalUserId: req.params.portalUserId, fromPortal: true, isRead: false },
      data: { isRead: true },
    });
    res.json(messages);
  },
);

// POST /portal/admin/messages/:portalUserId (admin — reply)
portalRouter.post(
  '/admin/messages/:portalUserId',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const user = (req as any).user;
    const { body } = req.body as { body?: string };
    if (!body?.trim()) {
      res.status(400).json({ error: 'body is required' });
      return;
    }
    const message = await prisma.portalMessage.create({
      data: {
        tenantId,
        portalUserId: req.params.portalUserId,
        fromPortal: false,
        senderName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        body: body.trim(),
      },
    });
    res.status(201).json(message);
  },
);

// GET /portal/admin/work-requests
portalRouter.get(
  '/admin/work-requests',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const { status } = req.query as { status?: string };
    const requests = await prisma.portalWorkRequest.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        portalUser: {
          select: { email: true, displayName: true, customerId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(requests);
  },
);

// PATCH /portal/admin/work-requests/:id
portalRouter.patch(
  '/admin/work-requests/:id',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const { status, notes, crmJobId } = req.body;
    const request = await prisma.portalWorkRequest.updateMany({
      where: { id: req.params.id, tenantId },
      data: { status, notes, crmJobId },
    });
    if (!request.count) {
      res.status(404).json({ error: 'Work request not found' });
      return;
    }
    res.json({ success: true });
  },
);
