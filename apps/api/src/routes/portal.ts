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
 *   GET  /portal/me                — portal user profile + linked customer/rental info
 *   GET  /portal/service-fee       — fee quote + disclosure for the submit screen
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
 *   POST   /portal/users           — create portal user (sends nothing)
 *   POST   /portal/users/:id/send-login-link — explicitly email a sign-in link
 *   DELETE /portal/users/:id       — deactivate portal user
 *   GET    /portal/admin/messages  — all message threads
 *   POST   /portal/admin/messages  — reply to customer
 *   GET    /portal/admin/work-requests — all work requests
 *   PATCH  /portal/admin/work-requests/:id — update status
 *   PATCH  /portal/admin/work-requests/:id/fee — set responsibility → fee outcome
 *   POST   /portal/admin/work-requests/:id/convert — create a CRM job from a request
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@fsp/db';
import { WorkRequestFeeStatus, WorkRequestResponsibility } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/authenticate';
import { decideFee, quoteFee } from '../lib/service-fee';
import { invoiceServiceFee, syncServiceFeePayments } from '../lib/fee-invoice';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  renderPortalInvite,
  sendPortalInvite,
  sendPortalMagicLink,
  type EmailDeliveryResult,
  type PortalInviteContent,
} from '../lib/email';

export const portalRouter = Router();

/**
 * Where a rental tenant lives.
 *
 * Resolved either as the LEASEHOLDER (Lease.pmTenantId) or as an OCCUPANT — a
 * spouse, adult child, or roommate who lives there without being on the lease.
 * Both need the property stamped onto their work requests so the office doesn't
 * have to match a free-text address back to a door.
 *
 * Returns null when neither applies — someone who has moved out can still sign
 * in, and their old requests should stay readable.
 */
async function resolveRentalContext(pmTenantId: string) {
  const lease =
    (await prisma.lease.findFirst({
      where: { pmTenantId, status: 'active' },
      orderBy: { startDate: 'desc' },
      include: { unit: { include: { property: true } } },
    })) ??
    (await prisma.lease.findFirst({
      where: {
        status: 'active',
        occupants: { some: { pmTenantId, removedAt: null } },
      },
      orderBy: { startDate: 'desc' },
      include: { unit: { include: { property: true } } },
    }));

  if (!lease) return null;

  const p = lease.unit.property;
  return {
    propertyId: p.id,
    propertyName: p.name,
    address: `${p.street}, ${p.city} ${p.state} ${p.zip}`,
    leaseEndDate: lease.endDate,
    isLeaseholder: lease.pmTenantId === pmTenantId,
  };
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET ?? JWT_SECRET + '_portal';
const MAGIC_LINK_EXPIRY_MINS = 15;
// The first-ever email is often opened hours or a day later; a 15-minute link
// would greet a new tenant with "expired". Still single-use.
const INVITE_EXPIRY_DAYS = 7;
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

// ─── Helper: issue + send a magic link ───────────────────────────────────────

/**
 * Creates a single-use sign-in link and emails it.
 *
 * The tenant slug is REQUIRED in the path: PortalApp reads the workspace from
 * pathname.split('/')[2], so a link of /portal/verify parses the slug as
 * "verify" and the session lands against a workspace that doesn't exist.
 */
async function issueAndSendMagicLink(opts: {
  portalUserId: string;
  to: string;
  displayName?: string | null;
  portalName: string;
  tenantSlug: string;
  /** When set, send the welcome email (long-lived link) instead of a plain sign-in link. */
  invite?: (link: string) => Promise<PortalInviteContent>;
}): Promise<{ result: EmailDeliveryResult; link: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const ttlMs = opts.invite ? INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000 : MAGIC_LINK_EXPIRY_MINS * 60 * 1000;
  await prisma.portalSession.create({
    data: {
      portalUserId: opts.portalUserId,
      token,
      type: 'magic_link',
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  const baseUrl = process.env.WEB_URL ?? 'http://localhost:5173';
  const link = `${baseUrl}/portal/${opts.tenantSlug}/verify?token=${token}`;

  if (opts.invite) {
    return { result: await sendPortalInvite(opts.to, await opts.invite(link)), link };
  }

  const result = await sendPortalMagicLink({
    to: opts.to,
    portalName: opts.portalName,
    link,
    expiryMins: MAGIC_LINK_EXPIRY_MINS,
    greetingName: opts.displayName?.split(' ')[0],
  });

  return { result, link };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB PORTAL — simple job-code + email access (§16 spec)
// ═══════════════════════════════════════════════════════════════════════════════

const JOB_SESSION_SECRET = process.env.JWT_SECRET ?? 'dev_secret';

// POST /portal/job-auth  { jobCode: string (last 8 of job.id), email?: string }
// Email is optional — job code alone is sufficient for access
portalRouter.post('/job-auth', async (req: Request, res: Response): Promise<void> => {
  const { jobCode, email } = req.body as { jobCode?: string; email?: string };
  if (!jobCode?.trim()) {
    res.status(400).json({ error: 'jobCode is required' });
    return;
  }

  // Find job whose id ends with the code (case-insensitive)
  const code = jobCode.trim().toUpperCase();
  const jobs = await prisma.job.findMany({
    where: { id: { endsWith: code.toLowerCase() } },
    include: {
      customer: { select: { email: true, firstName: true, lastName: true, phone: true } },
      serviceAddress: { select: { street: true, city: true, state: true, zip: true } },
    },
    take: 5,
  });

  // If email provided, verify it matches for extra security; otherwise code-only is fine
  let job = email?.trim()
    ? jobs.find(j => j.customer.email?.toLowerCase() === email.trim().toLowerCase())
    : jobs[0];

  if (!job) {
    res.status(401).json({ error: 'Job code not found. Please check the code and try again.' });
    return;
  }

  const token = jwt.sign(
    { jobId: job.id, tenantId: job.tenantId, type: 'job_portal' },
    JOB_SESSION_SECRET,
    { expiresIn: '24h' },
  );

  res.json({
    success: true,
    data: {
      token,
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        scheduledStart: job.scheduledStart,
        scheduledEnd: job.scheduledEnd,
        serviceAddress: job.serviceAddress,
        customer: { firstName: job.customer.firstName, lastName: job.customer.lastName },
      },
    },
  });
});

// Middleware for job portal session
function jobPortalAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JOB_SESSION_SECRET) as { jobId: string; tenantId: string; type: string };
    if (payload.type !== 'job_portal') { res.status(401).json({ error: 'Invalid token' }); return; }
    (req as any).jobPortal = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// GET /portal/job/:jobId — customer-safe job data
portalRouter.get('/job/:jobId', jobPortalAuth, async (req: Request, res: Response): Promise<void> => {
  const { jobId, tenantId } = (req as any).jobPortal;
  if (req.params.jobId !== jobId) { res.status(403).json({ error: 'Forbidden' }); return; }

  const [job, notes, files] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        serviceAddress: { select: { street: true, city: true, state: true, zip: true } },
        lineItems: { select: { description: true, quantity: true, unitPrice: true } },
      },
    }),
    prisma.jobNote.findMany({
      where: { jobId, isInternal: false },
      include: { author: { select: { role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.jobFile.findMany({
      where: { jobId, tenantId, visibility: 'customer_visible', fileType: 'photo', deletedAt: null },
      select: {
        id: true, photoCategory: true, stageName: true, notes: true,
        noteVisibility: true, createdAt: true, mimeType: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!job || job.tenantId !== tenantId) { res.status(404).json({ error: 'Job not found' }); return; }

  const CUSTOMER_STATUSES: Record<string, string> = {
    draft: 'Scheduled', scheduled: 'Scheduled', en_route: 'In Progress',
    in_progress: 'In Progress', on_hold: 'Waiting on Materials',
    completed: 'Completed', cancelled: 'Cancelled',
  };

  res.json({
    success: true,
    data: {
      job: {
        id: job.id,
        title: job.title,
        status: CUSTOMER_STATUSES[job.status] ?? job.status,
        scheduledStart: job.scheduledStart,
        scheduledEnd: job.scheduledEnd,
        serviceAddress: job.serviceAddress,
        customer: job.customer,
        lineItems: job.lineItems.map(li => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
      },
      notes: notes.map(n => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        authorRole: n.author.role,
      })),
      photos: files.map(f => ({
        id: f.id,
        photoCategory: f.photoCategory,
        notes: f.noteVisibility === 'customer_visible' ? f.notes : null,
        createdAt: f.createdAt,
        url: `/api/v1/portal/job-file/${f.id}`,
      })),
    },
  });
});

// GET /portal/job-file/:fileId — serve customer-visible photo (job portal session)
portalRouter.get('/job-file/:fileId', jobPortalAuth, async (req: Request, res: Response): Promise<void> => {
  const { jobId, tenantId } = (req as any).jobPortal;
  const file = await prisma.jobFile.findUnique({ where: { id: req.params.fileId } });
  if (!file || file.jobId !== jobId || file.tenantId !== tenantId || file.visibility !== 'customer_visible' || file.deletedAt) {
    res.status(404).json({ error: 'File not found' }); return;
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(file.data);
});

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

  await issueAndSendMagicLink({
    portalUserId: portalUser.id,
    to: email,
    displayName: portalUser.displayName,
    portalName: tenant.portalConfig.portalName,
    tenantSlug: tenant.slug,
  });

  // Deliberately the same response whether or not delivery succeeded — this
  // route is unauthenticated, and a distinguishable reply turns it into an
  // address-enumeration oracle.
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

  // Rental tenants are linked to a PMTenant rather than a Customer.
  const rental = portalUser.pmTenantId ? await resolveRentalContext(portalUser.pmTenantId) : null;

  res.json({
    id: portalUser.id,
    email: portalUser.email,
    phone: portalUser.phone,
    displayName: portalUser.displayName,
    customer,
    rental,
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

// GET /portal/service-fee?urgency=normal
// What to show the tenant on the submit screen, before they commit to anything.
portalRouter.get('/service-fee', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  const { urgency } = req.query as { urgency?: string };
  const quote = quoteFee(portalUser.tenant.portalConfig, urgency ?? 'normal');
  res.json({
    applies: quote.applies,
    amount: quote.amount ? Number(quote.amount) : null,
    disclosure: quote.disclosure,
    requiresAcknowledgement: quote.requiresAcknowledgement,
    headline: quote.headline,
    acknowledgementLabel: quote.acknowledgementLabel,
  });
});

// GET /portal/invoices
portalRouter.get('/invoices', portalAuth, async (req: Request, res: Response): Promise<void> => {
  const portalUser = (req as any).portalUser;
  if (!portalUser.customerId) {
    res.json([]);
    return;
  }
  // A tenant who just paid through Square should see it reflected here.
  await syncServiceFeePayments(portalUser.tenantId).catch(() => undefined);
  const invoicesRaw = await prisma.invoice.findMany({
    where: { customerId: portalUser.customerId },
    include: { lineItems: true, payments: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  // Include payToken for each invoice so portal can link to /pay/:token
  const invoices = await Promise.all(invoicesRaw.map(async (inv) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ payToken: string | null }>>(
      `SELECT "payToken" FROM "invoices" WHERE id = $1`, inv.id
    );
    return { ...inv, payToken: rows[0]?.payToken ?? null };
  }));
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
    const {
      title,
      description,
      serviceAddress,
      category,
      urgency,
      photoUrls,
      acknowledgedFee,
    } = req.body as {
      title?: string;
      description?: string;
      serviceAddress?: string;
      category?: string;
      urgency?: string;
      photoUrls?: string[];
      acknowledgedFee?: boolean;
    };
    if (!title || !description) {
      res.status(400).json({ error: 'title and description are required' });
      return;
    }

    const effectiveUrgency = urgency ?? 'normal';
    const quote = quoteFee(portalUser.tenant.portalConfig, effectiveUrgency);

    // The tenant must have been shown the fee and agreed to it. Refusing here
    // rather than silently recording the fee keeps "I was never told" off the table.
    if (quote.requiresAcknowledgement && !acknowledgedFee) {
      res.status(400).json({
        error: 'Service fee acknowledgement required',
        code: 'FEE_ACKNOWLEDGEMENT_REQUIRED',
        fee: { amount: Number(quote.amount), disclosure: quote.disclosure },
      });
      return;
    }

    const rental = portalUser.pmTenantId ? await resolveRentalContext(portalUser.pmTenantId) : null;

    const request = await prisma.portalWorkRequest.create({
      data: {
        tenantId: portalUser.tenantId,
        portalUserId: portalUser.id,
        propertyId: rental?.propertyId ?? null,
        title,
        description,
        // Fall back to the leased address so the office always has somewhere to go.
        serviceAddress: serviceAddress ?? rental?.address ?? null,
        category,
        urgency: effectiveUrgency,
        photoUrls: photoUrls ?? [],
        feeStatus: quote.status,
        feeAmount: quote.amount,
        feeAcknowledgedAt: quote.applies ? new Date() : null,
        // Exactly what the tenant agreed to, kept even if the policy text changes later.
        feeDisclosureSnapshot: quote.applies
          ? `${quote.disclosure}

[Acknowledged] ${quote.acknowledgementLabel}`
          : null,
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
      include: {
        pmTenant: {
          select: {
            firstName: true,
            lastName: true,
            leases: {
              where: { status: 'active' },
              select: { unit: { select: { property: { select: { name: true } } } } },
              take: 1,
            },
            occupancies: {
              where: { removedAt: null, lease: { status: 'active' } },
              select: { lease: { select: { unit: { select: { property: { select: { name: true } } } } } } },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ displayName: 'asc' }],
    });

    res.json(
      users.map((u) => {
        const asLeaseholder = u.pmTenant?.leases[0]?.unit.property.name ?? null;
        const asOccupant = u.pmTenant?.occupancies[0]?.lease.unit.property.name ?? null;
        return {
          id: u.id,
          email: u.email,
          phone: u.phone,
          displayName: u.displayName,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
          isRentalTenant: !!u.pmTenantId,
          property: asLeaseholder ?? asOccupant,
          role: asLeaseholder ? 'leaseholder' : asOccupant ? 'occupant' : null,
        };
      }),
    );
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

type PortalUserWithConfig = Awaited<ReturnType<typeof loadPortalUserForEmail>>;

async function loadPortalUserForEmail(tenantId: string, id: string) {
  return prisma.portalUser.findFirst({
    where: { id, tenantId },
    include: { tenant: { include: { portalConfig: true } }, pmTenant: { select: { firstName: true } } },
  });
}

async function buildInviteContent(pu: NonNullable<PortalUserWithConfig>, link: string): Promise<PortalInviteContent> {
  const cfg = pu.tenant.portalConfig!;
  const rental = pu.pmTenantId ? await resolveRentalContext(pu.pmTenantId) : null;
  const baseUrl = process.env.WEB_URL ?? 'http://localhost:5173';
  const feeOn = cfg.serviceFeeEnabled && Number(cfg.serviceFeeAmount) > 0;
  return {
    greetingName: pu.pmTenant?.firstName ?? pu.displayName?.split(' ')[0] ?? null,
    companyName: pu.tenant.name,
    portalName: cfg.portalName,
    propertyLabel: rental ? `${rental.propertyName} (${rental.address})` : null,
    link,
    portalUrl: `${baseUrl}/portal/${pu.tenant.slug}`,
    expiryDays: INVITE_EXPIRY_DAYS,
    fee: feeOn ? { amount: Number(cfg.serviceFeeAmount), always: !cfg.serviceFeeWaiveLandlord } : null,
    accentColor: cfg.primaryColor,
  };
}

// GET /portal/users/:id/invite-preview (admin)
// Exactly what the welcome email will look like for this person. Creates no
// link and sends nothing — the button in the preview is inert.
portalRouter.get(
  '/users/:id/invite-preview',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const pu = await loadPortalUserForEmail((req as any).user.tenantId, req.params.id);
    if (!pu || !pu.tenant.portalConfig) {
      res.status(404).json({ error: 'Portal user not found' });
      return;
    }
    const { subject, html } = renderPortalInvite(await buildInviteContent(pu, '#preview'));
    res.json({ to: pu.email, subject, html, firstEmail: !pu.lastLoginAt });
  },
);

// POST /portal/users/:id/send-login-link (admin)
// Explicit and manual on purpose — creating a portal user sends nothing, and
// nothing in this system emails a tenant unless an operator asks for it here.
portalRouter.post(
  '/users/:id/send-login-link',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;

    const portalUser = await loadPortalUserForEmail(tenantId, req.params.id);
    if (!portalUser) {
      res.status(404).json({ error: 'Portal user not found' });
      return;
    }
    if (!portalUser.isActive) {
      res.status(409).json({ error: 'This portal user is deactivated' });
      return;
    }
    if (!portalUser.tenant.portalConfig?.isEnabled) {
      res.status(409).json({ error: 'The portal is not enabled for this workspace' });
      return;
    }

    // Someone who has never signed in gets the welcome email; everyone else a
    // routine sign-in link.
    const isInvite = !portalUser.lastLoginAt;
    const { result, link } = await issueAndSendMagicLink({
      portalUserId: portalUser.id,
      to: portalUser.email,
      displayName: portalUser.displayName,
      portalName: portalUser.tenant.portalConfig.portalName,
      tenantSlug: portalUser.tenant.slug,
      invite: isInvite ? (l) => buildInviteContent(portalUser, l) : undefined,
    });
    const what = isInvite ? 'Welcome email' : 'Login link';

    // Admin-triggered, so report honestly rather than always claiming success.
    res.json({
      result,
      to: portalUser.email,
      // Surfaced only when email isn't configured, so links can still be shared by hand.
      link: result === 'simulated' ? link : undefined,
      message:
        result === 'sent'
          ? `${what} sent to ${portalUser.email}.`
          : result === 'simulated'
            ? 'Email is not configured (RESEND_API_KEY unset), so nothing was sent. The link is included here.'
            : 'The email provider rejected the message. Nothing was delivered.',
    });
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
    const { status, feeStatus } = req.query as { status?: string; feeStatus?: string };
    await syncServiceFeePayments(tenantId).catch(() => undefined);
    const requests = await prisma.portalWorkRequest.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(feeStatus ? { feeStatus: feeStatus as WorkRequestFeeStatus } : {}),
      },
      include: {
        portalUser: {
          select: {
            email: true,
            displayName: true,
            customerId: true,
            pmTenant: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        property: { select: { id: true, name: true, street: true, city: true, zip: true } },
        feeDecidedBy: { select: { firstName: true, lastName: true } },
        feeInvoice: {
          select: { id: true, invoiceNumber: true, status: true, amountDue: true, squarePaymentUrl: true, paidAt: true },
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

// PATCH /portal/admin/work-requests/:id/fee
// Record who was responsible; the fee status follows from that rather than
// being set directly, so "waived" and "assessed" always have a reason attached.
portalRouter.patch(
  '/admin/work-requests/:id/fee',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const { responsibility, note } = req.body as {
      responsibility?: WorkRequestResponsibility;
      note?: string;
    };

    if (!responsibility || !(responsibility in WorkRequestResponsibility)) {
      res.status(400).json({
        error: `responsibility must be one of: ${Object.keys(WorkRequestResponsibility).join(', ')}`,
      });
      return;
    }

    const existing = await prisma.portalWorkRequest.findFirst({
      where: { id: req.params.id, tenantId: user.tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Work request not found' });
      return;
    }

    const config = await prisma.portalConfig.findUnique({ where: { tenantId: user.tenantId } });
    const nextStatus = decideFee(config, responsibility, existing.urgency, existing.feeStatus);

    const updated = await prisma.portalWorkRequest.update({
      where: { id: existing.id },
      data: {
        responsibility,
        ...(nextStatus ? { feeStatus: nextStatus } : {}),
        feeDecidedAt: new Date(),
        feeDecidedById: user.id,
        feeDecisionNote: note ?? null,
      },
    });

    res.json({
      id: updated.id,
      responsibility: updated.responsibility,
      feeStatus: updated.feeStatus,
      feeAmount: updated.feeAmount ? Number(updated.feeAmount) : null,
    });
  },
);

// POST /portal/admin/work-requests/:id/invoice-fee
// Bill the service fee after the visit: creates the invoice, a Square payment
// link, and emails the tenant. Only ever runs on an explicit click.
portalRouter.post(
  '/admin/work-requests/:id/invoice-fee',
  authenticate,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user.tenantId;
    const result = await invoiceServiceFee(tenantId, req.params.id);
    res.status(201).json(result);
  },
);

// POST /portal/admin/work-requests/:id/convert
// Turn an accepted request into a CRM job. Previously requests accumulated in
// their own table with no way through to scheduled work.
portalRouter.post(
  '/admin/work-requests/:id/convert',
  authenticate,
  requireRole('owner', 'admin', 'dispatcher'),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;

    const request = await prisma.portalWorkRequest.findFirst({
      where: { id: req.params.id, tenantId: user.tenantId },
      include: {
        portalUser: { include: { pmTenant: true } },
        property: true,
      },
    });
    if (!request) {
      res.status(404).json({ error: 'Work request not found' });
      return;
    }
    if (request.crmJobId) {
      res.status(409).json({ error: 'Already converted', crmJobId: request.crmJobId });
      return;
    }

    // CRMJob requires a Contact. Rental tenants live in PMTenant, so find or
    // create the matching Contact rather than duplicating one per request.
    const pm = request.portalUser.pmTenant;
    const fullName = pm
      ? `${pm.firstName} ${pm.lastName}`
      : (request.portalUser.displayName ?? request.portalUser.email);
    const phone = pm?.phone ?? request.portalUser.phone ?? '';

    let contact = await prisma.contact.findFirst({
      where: { tenantId: user.tenantId, fullName, isArchived: false },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId: user.tenantId,
          type: 'individual',
          fullName,
          phone,
          email: request.portalUser.email,
          address: request.property?.street ?? request.serviceAddress ?? null,
          city: request.property?.city ?? null,
          state: request.property?.state ?? null,
          zip: request.property?.zip ?? null,
          category: 'Tenant',
          status: 'active_client',
          leadSource: 'natural_contact',
          notes: 'Created automatically from a tenant portal work request.',
        },
      });
    }

    const year = new Date().getFullYear();
    const last = await prisma.cRMJob.findFirst({
      where: { tenantId: user.tenantId, jobNumber: { startsWith: `JOB-${year}-` } },
      orderBy: { jobNumber: 'desc' },
    });
    const seq = last ? parseInt(last.jobNumber.split('-')[2] ?? '0') + 1 : 1;
    const jobNumber = `JOB-${year}-${String(seq).padStart(4, '0')}`;

    const job = await prisma.cRMJob.create({
      data: {
        tenantId: user.tenantId,
        jobNumber,
        name: request.title,
        contactId: contact.id,
        serviceAddress: request.property?.street ?? request.serviceAddress ?? null,
        serviceCity: request.property?.city ?? null,
        serviceState: request.property?.state ?? null,
        serviceZip: request.property?.zip ?? null,
        tradeCategory: request.category ?? null,
        status: 'approved',
        notes: request.description,
        createdById: user.id,
      },
    });

    await prisma.portalWorkRequest.update({
      where: { id: request.id },
      data: { crmJobId: job.id, status: 'scheduled' },
    });

    res.status(201).json({ crmJobId: job.id, jobNumber: job.jobNumber, contactId: contact.id });
  },
);
