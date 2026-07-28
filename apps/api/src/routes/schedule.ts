import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../socket';
import type { ApiResponse } from '@fsp/types';

export const scheduleRouter = Router();

scheduleRouter.use(authenticate);

function dayRange(dateStr?: string, timezone = 'America/New_York') {
  // Use tenant timezone to compute day boundaries
  const now = dateStr ? new Date(`${dateStr}T12:00:00Z`) : new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDate = dateStr ?? formatter.format(now); // YYYY-MM-DD
  // Compute start of day in the given timezone
  const parts = localDate.split('-').map(Number);
  const dtStr = `${localDate}T00:00:00`;
  // Create a Date representing midnight in the target timezone
  const tempDate = new Date(dtStr);
  const utcMidnight = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzMidnight = new Date(tempDate.toLocaleString('en-US', { timeZone: timezone }));
  const offset = utcMidnight.getTime() - tzMidnight.getTime();
  const start = new Date(tempDate.getTime() + offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

const jobInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  serviceAddress: true,
  technician: { select: { id: true, firstName: true, lastName: true, phone: true } },
  assignedTechnicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
};

// GET /api/v1/schedule?date=YYYY-MM-DD&technicianId=...
scheduleRouter.get('/', async (req, res) => {
  const { date, technicianId } = req.query as { date?: string; technicianId?: string };
  const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId }, select: { timezone: true } });
  const { start, end } = dayRange(date, tenant?.timezone);

  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    scheduledStart: { gte: start, lt: end },
  };
  // Match jobs where tech is lead OR in assignedTechnicians junction table
  if (technicianId) {
    where.OR = [
      { technicianId },
      { assignedTechnicians: { some: { userId: technicianId } } },
    ];
  }

  const jobs = await prisma.job.findMany({
    where,
    include: jobInclude,
    orderBy: { scheduledStart: 'asc' },
  });

  res.json({ success: true, data: jobs } satisfies ApiResponse);
});

// GET /api/v1/schedule/board?date=YYYY-MM-DD
// Returns all jobs for the day grouped by technician (plus unassigned)
scheduleRouter.get('/board', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const { date } = req.query as { date?: string };
  const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId }, select: { timezone: true } });
  const { start, end } = dayRange(date, tenant?.timezone);

  const [jobs, technicians] = await Promise.all([
    prisma.job.findMany({
      where: {
        tenantId: req.user!.tenantId,
        scheduledStart: { gte: start, lt: end },
        status: { notIn: ['cancelled'] },
      },
      include: jobInclude,
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, role: 'technician', status: 'active' },
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        isAvailable: true, skills: true,
        technicianLocations: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { firstName: 'asc' },
    }),
  ]);

  // Also fetch unscheduled jobs (no scheduledStart) so they appear in Unassigned column
  const unscheduled = await prisma.job.findMany({
    where: {
      tenantId: req.user!.tenantId,
      scheduledStart: null,
      status: { notIn: ['cancelled', 'completed'] },
    },
    include: jobInclude,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({
    success: true,
    data: { jobs: [...jobs, ...unscheduled], technicians },
  } satisfies ApiResponse);
});

// POST /api/v1/schedule/assign  — drag-drop assign
scheduleRouter.post('/assign', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const {
    jobId,
    technicianId,        // null = unassign
    scheduledStart,      // optional ISO string
    scheduledEnd,
  } = req.body as {
    jobId: string;
    technicianId: string | null;
    scheduledStart?: string;
    scheduledEnd?: string;
  };

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  // Validate technician belongs to this tenant
  if (technicianId) {
    const tech = await prisma.user.findUnique({ where: { id: technicianId } });
    if (!tech || tech.tenantId !== req.user!.tenantId) {
      throw new AppError('Technician not found', 404, 'NOT_FOUND');
    }
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      technicianId: technicianId ?? null,
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      // Auto-promote draft → scheduled when assigned
      status: job.status === 'draft' && technicianId ? 'scheduled' : undefined,
    },
    include: jobInclude,
  });

  // Keep jobTechnician junction table in sync — upsert lead tech, preserve secondary techs
  if (technicianId) {
    const existing = await prisma.jobTechnician.findFirst({ where: { jobId, userId: technicianId } });
    if (!existing) {
      await prisma.jobTechnician.create({ data: { jobId, userId: technicianId } });
    }
  }
  // If unassigning lead, only remove the old lead tech from junction (not secondaries)
  if (!technicianId && job.technicianId) {
    await prisma.jobTechnician.deleteMany({ where: { jobId, userId: job.technicianId } });
  }

  // Broadcast to all dispatchers/techs in this tenant
  io?.to(`tenant:${req.user!.tenantId}`).emit('job:assigned', {
    job: updated,
    assignedBy: req.user!.sub,
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// GET /api/v1/schedule/technicians
scheduleRouter.get('/technicians', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const technicians = await prisma.user.findMany({
    where: { tenantId: req.user!.tenantId, role: 'technician', status: 'active' },
    select: {
      id: true, firstName: true, lastName: true, phone: true,
      isAvailable: true, skills: true,
      technicianLocations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
    orderBy: { firstName: 'asc' },
  });
  res.json({ success: true, data: technicians } satisfies ApiResponse);
});

// GET /api/v1/schedule/map-jobs — jobs with address coords for map display
scheduleRouter.get('/map-jobs', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const { date } = req.query as { date?: string };
  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    status: { notIn: ['cancelled'] },
  };
  if (date) {
    const d = new Date(date); const next = new Date(d); next.setDate(next.getDate() + 1);
    where.scheduledStart = { gte: d, lt: next };
  }
  const jobs = await prisma.job.findMany({
    where,
    take: 200,
    orderBy: { scheduledStart: 'asc' },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      technician: { select: { id: true, firstName: true, lastName: true } },
      serviceAddress: { select: { street: true, city: true, state: true, zip: true, lat: true, lng: true } },
    },
  });
  res.json({ success: true, data: jobs });
});

// POST /api/v1/schedule/geocode-backfill — owner/admin: geocode all addresses missing coords
scheduleRouter.post('/geocode-backfill', async (req, res) => {
  if (!['owner', 'admin'].includes(req.user!.role)) {
    res.status(403).json({ success: false, message: 'Forbidden' }); return;
  }
  const { geocodeAddress } = await import('../lib/geocode');
  const addresses = await prisma.serviceAddress.findMany({
    where: { lat: null, NOT: { street: 'TBD' } },
    select: { id: true, street: true, city: true, state: true, zip: true, country: true },
  });
  let updated = 0;
  for (const addr of addresses) {
    const coords = await geocodeAddress(addr);
    if (coords) {
      await prisma.serviceAddress.update({ where: { id: addr.id }, data: coords });
      updated++;
    }
    await new Promise((r) => setTimeout(r, 50)); // respect rate limit
  }
  res.json({ success: true, data: { total: addresses.length, geocoded: updated } });
});
