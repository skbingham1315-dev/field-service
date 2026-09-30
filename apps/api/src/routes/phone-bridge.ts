import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { authenticateDevice, generateDeviceToken, hashDeviceToken } from '../middleware/deviceAuth';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

export const phoneBridgeRouter = Router();

// ── Helper: normalize phone number to E.164-ish ──────────────────────────────
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// ── Helper: find or create thread ────────────────────────────────────────────
async function getOrCreateThread(tenantId: string, phoneNumber: string, displayName?: string) {
  const normalized = normalizePhone(phoneNumber);

  const existing = await prisma.phoneThread.findUnique({
    where: { tenantId_phoneNumber: { tenantId, phoneNumber: normalized } },
  });
  if (existing) return existing;

  // Try to match to a customer by phone
  const customer = await prisma.customer.findFirst({
    where: { tenantId, phone: { contains: normalized.slice(-10) } },
    select: { id: true, firstName: true, lastName: true },
  });

  // Try to match to a CRM contact
  const contact = customer ? null : await prisma.contact.findFirst({
    where: { tenantId, phone: { contains: normalized.slice(-10) } },
    select: { id: true, fullName: true, businessName: true, contactPerson: true },
  });

  const resolvedName = displayName
    || (customer ? `${customer.firstName} ${customer.lastName}` : null)
    || contact?.fullName || contact?.contactPerson || contact?.businessName
    || null;

  return prisma.phoneThread.create({
    data: {
      tenantId,
      phoneNumber: normalized,
      displayName: resolvedName,
      customerId: customer?.id ?? null,
      contactId: contact?.id ?? null,
      isKnown: !!(customer || contact),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (JWT auth, owner/admin only)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Register a new device ────────────────────────────────────────────────────
phoneBridgeRouter.post('/devices/register', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  const { deviceName, deviceModel } = req.body as { deviceName: string; deviceModel?: string };
  if (!deviceName) throw new AppError('deviceName required', 400);

  const token = generateDeviceToken();
  const tokenHash = hashDeviceToken(token);

  const device = await prisma.phoneBridgeDevice.create({
    data: {
      tenantId: req.user!.tenantId,
      deviceName,
      deviceModel: deviceModel ?? null,
      tokenHash,
    },
    select: { id: true, deviceName: true, deviceModel: true, createdAt: true },
  });

  // Return the token ONCE — it's hashed in DB and can't be recovered
  res.json({ success: true, data: { ...device, token } });
});

// ── List devices ─────────────────────────────────────────────────────────────
phoneBridgeRouter.get('/devices', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  const devices = await prisma.phoneBridgeDevice.findMany({
    where: { tenantId: req.user!.tenantId },
    select: { id: true, deviceName: true, deviceModel: true, isActive: true, lastSeenAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: devices });
});

// ── Revoke device (kill switch) ──────────────────────────────────────────────
phoneBridgeRouter.post('/devices/:id/revoke', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  await prisma.phoneBridgeDevice.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true, data: { message: 'Device revoked' } });
});

// ── Reactivate device ────────────────────────────────────────────────────────
phoneBridgeRouter.post('/devices/:id/activate', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  await prisma.phoneBridgeDevice.update({
    where: { id: req.params.id },
    data: { isActive: true },
  });
  res.json({ success: true, data: { message: 'Device activated' } });
});

// ── Get/update phone bridge config ───────────────────────────────────────────
phoneBridgeRouter.get('/config', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  const device = await prisma.phoneBridgeDevice.findFirst({
    where: { tenantId: req.user!.tenantId, isActive: true },
    select: { id: true, config: true },
  });
  const defaultConfig = {
    businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], timezone: 'America/Phoenix' },
    missedCallTemplate: "On a job site, I'll call you back within 2 hours. For estimates, text the address and a few photos.",
    afterHoursTemplate: "Thanks for contacting Blue Dingo Construction & Remodel. Our office hours are Monday through Friday, 9 AM to 5 PM. We're out of the office right now and will get back to you the next business day.",
    arrivalTemplate: "Blue Dingo is on site!",
    allowlist: [],
    cooldownHours: 4,
    useAiReplies: true,
  };
  res.json({ success: true, data: device?.config ?? defaultConfig });
});

phoneBridgeRouter.put('/config', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  const device = await prisma.phoneBridgeDevice.findFirst({
    where: { tenantId: req.user!.tenantId, isActive: true },
  });
  if (!device) throw new AppError('No active device', 404);

  await prisma.phoneBridgeDevice.update({
    where: { id: device.id },
    data: { config: req.body },
  });
  res.json({ success: true, data: { message: 'Config updated' } });
});

// ── List threads ─────────────────────────────────────────────────────────────
phoneBridgeRouter.get('/threads', authenticate, async (req, res) => {
  const { limit = '50', archived = 'false' } = req.query as Record<string, string>;
  const threads = await prisma.phoneThread.findMany({
    where: { tenantId: req.user!.tenantId, isArchived: archived === 'true' },
    orderBy: { lastMessageAt: 'desc' },
    take: Math.min(parseInt(limit), 100),
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { messages: true, calls: true } },
    },
  });
  res.json({ success: true, data: threads });
});

// ── Get thread with messages ─────────────────────────────────────────────────
phoneBridgeRouter.get('/threads/:id', authenticate, async (req, res) => {
  const thread = await prisma.phoneThread.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true } },
      messages: { orderBy: { timestamp: 'desc' }, take: 100 },
      calls: { orderBy: { timestamp: 'desc' }, take: 50 },
      draftReplies: { where: { status: 'pending' } },
    },
  });
  if (!thread) throw new AppError('Thread not found', 404);
  res.json({ success: true, data: thread });
});

// ── Get draft replies pending approval ───────────────────────────────────────
phoneBridgeRouter.get('/drafts', authenticate, async (req, res) => {
  const drafts = await prisma.phoneDraftReply.findMany({
    where: { tenantId: req.user!.tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: { thread: { select: { phoneNumber: true, displayName: true } } },
  });
  res.json({ success: true, data: drafts });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE ENDPOINTS (device token auth)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Ingest SMS batch ─────────────────────────────────────────────────────────
phoneBridgeRouter.post('/ingest/messages', authenticateDevice, async (req, res) => {
  const { messages } = req.body as {
    messages: Array<{
      phoneNumber: string;
      displayName?: string;
      direction: 'inbound' | 'outbound';
      body: string;
      timestamp: string;
      source?: string;
    }>;
  };

  if (!messages?.length) {
    res.json({ success: true, data: { ingested: 0 } });
    return;
  }

  const tenantId = req.device!.tenantId;
  let ingested = 0;

  for (const msg of messages) {
    try {
      const thread = await getOrCreateThread(tenantId, msg.phoneNumber, msg.displayName);

      // Dedupe by thread + timestamp + direction + body hash
      const existing = await prisma.phoneMessage.findFirst({
        where: {
          threadId: thread.id,
          timestamp: new Date(msg.timestamp),
          direction: msg.direction,
          body: msg.body,
        },
      });
      if (existing) continue;

      await prisma.phoneMessage.create({
        data: {
          tenantId,
          threadId: thread.id,
          direction: msg.direction,
          body: msg.body,
          source: msg.source ?? 'captured',
          timestamp: new Date(msg.timestamp),
          isRead: msg.direction === 'outbound',
        },
      });

      // Update thread
      await prisma.phoneThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(msg.timestamp),
          lastMessagePreview: msg.body.slice(0, 200),
          ...(msg.direction === 'inbound' ? { unreadCount: { increment: 1 } } : {}),
          ...(msg.displayName && !thread.displayName ? { displayName: msg.displayName } : {}),
        },
      });

      ingested++;
    } catch (err) {
      logger.warn('[phone-bridge] failed to ingest message', { phoneNumber: msg.phoneNumber, err });
    }
  }

  res.json({ success: true, data: { ingested } });
});

// ── Ingest call log batch ────────────────────────────────────────────────────
phoneBridgeRouter.post('/ingest/calls', authenticateDevice, async (req, res) => {
  const { calls } = req.body as {
    calls: Array<{
      phoneNumber: string;
      displayName?: string;
      direction: 'inbound' | 'outbound' | 'missed';
      duration: number;
      timestamp: string;
      hasVoicemail?: boolean;
    }>;
  };

  if (!calls?.length) {
    res.json({ success: true, data: { ingested: 0 } });
    return;
  }

  const tenantId = req.device!.tenantId;
  let ingested = 0;

  for (const call of calls) {
    try {
      const thread = await getOrCreateThread(tenantId, call.phoneNumber, call.displayName);

      // Dedupe
      const existing = await prisma.phoneCall.findFirst({
        where: {
          threadId: thread.id,
          timestamp: new Date(call.timestamp),
          direction: call.direction,
        },
      });
      if (existing) continue;

      await prisma.phoneCall.create({
        data: {
          tenantId,
          threadId: thread.id,
          phoneNumber: normalizePhone(call.phoneNumber),
          direction: call.direction,
          duration: call.duration,
          timestamp: new Date(call.timestamp),
          hasVoicemail: call.hasVoicemail ?? false,
        },
      });

      ingested++;
    } catch (err) {
      logger.warn('[phone-bridge] failed to ingest call', { phoneNumber: call.phoneNumber, err });
    }
  }

  res.json({ success: true, data: { ingested } });
});

// ── Get pending drafts for device ────────────────────────────────────────────
phoneBridgeRouter.get('/device/drafts', authenticateDevice, async (req, res) => {
  const drafts = await prisma.phoneDraftReply.findMany({
    where: { tenantId: req.device!.tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: { thread: { select: { phoneNumber: true, displayName: true } } },
  });
  res.json({ success: true, data: drafts });
});

// ── Approve/reject a draft ───────────────────────────────────────────────────
phoneBridgeRouter.post('/device/drafts/:id/decide', authenticateDevice, async (req, res) => {
  const { action, editedBody } = req.body as { action: 'approve' | 'reject'; editedBody?: string };
  const draft = await prisma.phoneDraftReply.findFirst({
    where: { id: req.params.id, tenantId: req.device!.tenantId, status: 'pending' },
    include: { thread: true },
  });
  if (!draft) throw new AppError('Draft not found', 404);

  if (action === 'reject') {
    await prisma.phoneDraftReply.update({
      where: { id: draft.id },
      data: { status: 'rejected', decidedAt: new Date() },
    });
    res.json({ success: true, data: { status: 'rejected' } });
    return;
  }

  const finalBody = editedBody || draft.body;

  // Mark draft as approved
  await prisma.phoneDraftReply.update({
    where: { id: draft.id },
    data: { status: 'approved', body: finalBody, decidedAt: new Date() },
  });

  // Record as outbound message
  await prisma.phoneMessage.create({
    data: {
      tenantId: draft.tenantId,
      threadId: draft.threadId,
      direction: 'outbound',
      body: finalBody,
      source: 'draft_approved',
      timestamp: new Date(),
    },
  });

  res.json({ success: true, data: { status: 'approved', body: finalBody, phoneNumber: draft.thread.phoneNumber } });
});

// ── Ingest geofence event ────────────────────────────────────────────────────
phoneBridgeRouter.post('/ingest/geofence', authenticateDevice, async (req, res) => {
  const { jobId, eventType, lat, lng } = req.body as {
    jobId: string; eventType: 'arrival' | 'departure'; lat: number; lng: number;
  };

  const event = await prisma.phoneGeofenceEvent.create({
    data: {
      tenantId: req.device!.tenantId,
      jobId,
      eventType,
      lat,
      lng,
    },
  });

  res.json({ success: true, data: event });
});

// ── Get active job locations for geofencing ──────────────────────────────────
phoneBridgeRouter.get('/device/job-locations', authenticateDevice, async (req, res) => {
  const jobs = await prisma.job.findMany({
    where: {
      tenantId: req.device!.tenantId,
      status: { in: ['scheduled', 'en_route', 'in_progress'] },
    },
    select: {
      id: true,
      title: true,
      serviceAddress: { select: { street: true, city: true, lat: true, lng: true } },
      customer: { select: { firstName: true, lastName: true, phone: true } },
      scheduledStart: true,
    },
  });

  const locatable = jobs.filter(j => j.serviceAddress.lat && j.serviceAddress.lng);
  res.json({ success: true, data: locatable });
});

// ── Device heartbeat / config sync ───────────────────────────────────────────
phoneBridgeRouter.get('/device/sync', authenticateDevice, async (req, res) => {
  const device = await prisma.phoneBridgeDevice.findFirst({
    where: { id: req.device!.id },
    select: { config: true, isActive: true },
  });

  const pendingDrafts = await prisma.phoneDraftReply.count({
    where: { tenantId: req.device!.tenantId, status: 'pending' },
  });

  res.json({
    success: true,
    data: {
      config: device?.config,
      isActive: device?.isActive,
      pendingDrafts,
    },
  });
});
