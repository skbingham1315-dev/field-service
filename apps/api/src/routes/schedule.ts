import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../socket';
import type { ApiResponse } from '@fsp/types';

export const scheduleRouter = Router();

scheduleRouter.use(authenticate);

function dayRange(dateStr?: string) {
  const start = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const jobInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  serviceAddress: true,
  technician: { select: { id: true, firstName: true, lastName: true, phone: true } },
};

// GET /api/v1/schedule?date=YYYY-MM-DD&technicianId=...
scheduleRouter.get('/', async (req, res) => {
  const { date, technicianId } = req.query as { date?: string; technicianId?: string };
  const { start, end } = dayRange(date);

  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    scheduledStart: { gte: start, lt: end },
  };
  if (technicianId) where.technicianId = technicianId;

  const jobs = await prisma.job.findMany({
    where,
    include: jobInclude,
    orderBy: { scheduledStart: 'asc' },
  });

  res.json({ success: true, data: jobs } satisfies ApiResponse);
});

// GET /api/v1/schedule/board?date=YYYY-MM-DD
// Returns all jobs for the day grouped by technician (plus unassigned)
scheduleRouter.get('/board', async (req, res) => {
  const { date } = req.query as { date?: string };
  const { start, end } = dayRange(date);

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
scheduleRouter.post('/assign', async (req, res) => {
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

  // Broadcast to all dispatchers/techs in this tenant
  io?.to(`tenant:${req.user!.tenantId}`).emit('job:assigned', {
    job: updated,
    assignedBy: req.user!.sub,
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// GET /api/v1/schedule/technicians
scheduleRouter.get('/technicians', async (req, res) => {
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
scheduleRouter.get('/map-jobs', async (req, res) => {
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
