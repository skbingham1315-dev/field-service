import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const timeEntriesRouter = Router();
timeEntriesRouter.use(authenticate);

// GET /api/v1/time-entries?userId=&startDate=&endDate=&status=
timeEntriesRouter.get('/', async (req, res) => {
  const { userId, startDate, endDate, status } = req.query as Record<string, string>;
  const { tenantId, role, sub } = req.user!;

  // Techs/sales only see their own entries
  const targetUserId = (role === 'technician' || role === 'sales') ? sub : (userId || undefined);

  const where: Record<string, unknown> = { tenantId };
  if (targetUserId) where.userId = targetUserId;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const entries = await prisma.timeEntry.findMany({
    where,
    orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
    include: {
      user: { select: { id: true, firstName: true, lastName: true, payRate: true, payType: true } },
      job: { select: { id: true, title: true } },
    },
  });

  res.json({ success: true, data: entries } satisfies ApiResponse);
});

// POST /api/v1/time-entries
timeEntriesRouter.post('/', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const { date, clockIn, clockOut, hoursWorked, jobId, notes } = req.body as {
    date: string;
    clockIn?: string;
    clockOut?: string;
    hoursWorked?: number;
    jobId?: string;
    notes?: string;
  };

  if (!date) { res.status(400).json({ success: false, message: 'date is required' }); return; }

  // Calculate hours from clock times if not provided
  let hours = hoursWorked ?? 0;
  if (!hours && clockIn && clockOut) {
    hours = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000;
    hours = Math.round(hours * 100) / 100;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      tenantId,
      userId,
      date: new Date(date),
      clockIn: clockIn ? new Date(clockIn) : null,
      clockOut: clockOut ? new Date(clockOut) : null,
      hoursWorked: hours,
      jobId: jobId || null,
      notes: notes || null,
      status: 'pending',
    },
    include: { job: { select: { id: true, title: true } } },
  });

  res.status(201).json({ success: true, data: entry } satisfies ApiResponse);
});

// PATCH /api/v1/time-entries/:id
timeEntriesRouter.patch('/:id', async (req, res) => {
  const { sub: userId, role, tenantId } = req.user!;
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.tenantId !== tenantId) {
    res.status(404).json({ success: false, message: 'Not found' }); return;
  }
  // Techs can only edit their own pending entries
  if ((role === 'technician' || role === 'sales') && (entry.userId !== userId || entry.status !== 'pending')) {
    res.status(403).json({ success: false, message: 'Cannot edit this entry' }); return;
  }

  const { clockIn, clockOut, hoursWorked, notes, status, jobId } = req.body;

  let hours = hoursWorked ?? entry.hoursWorked;
  if (clockIn && clockOut && !hoursWorked) {
    hours = Math.round(((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000) * 100) / 100;
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      clockIn: clockIn ? new Date(clockIn) : entry.clockIn,
      clockOut: clockOut ? new Date(clockOut) : entry.clockOut,
      hoursWorked: hours,
      notes: notes ?? entry.notes,
      jobId: jobId !== undefined ? (jobId || null) : entry.jobId,
      // Only admins/owners can change status
      status: (['owner', 'admin', 'dispatcher'].includes(role) && status) ? status : entry.status,
    },
    include: { job: { select: { id: true, title: true } } },
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// DELETE /api/v1/time-entries/:id
timeEntriesRouter.delete('/:id', async (req, res) => {
  const { sub: userId, role, tenantId } = req.user!;
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.tenantId !== tenantId) {
    res.status(404).json({ success: false, message: 'Not found' }); return;
  }
  if ((role === 'technician' || role === 'sales') && (entry.userId !== userId || entry.status !== 'pending')) {
    res.status(403).json({ success: false, message: 'Cannot delete this entry' }); return;
  }
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  res.json({ success: true, data: { message: 'Deleted' } } satisfies ApiResponse);
});

// POST /api/v1/time-entries/clock-in
timeEntriesRouter.post('/clock-in', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { jobId } = req.body as { jobId?: string };

  // Check if already clocked in today (no clockOut)
  const existing = await prisma.timeEntry.findFirst({
    where: { userId, tenantId, date: today, clockOut: null, clockIn: { not: null } },
  });
  if (existing) {
    res.status(400).json({ success: false, message: 'Already clocked in. Clock out first.' }); return;
  }

  const entry = await prisma.timeEntry.create({
    data: { tenantId, userId, date: today, clockIn: new Date(), jobId: jobId || null, status: 'pending' },
  });
  res.status(201).json({ success: true, data: entry } satisfies ApiResponse);
});

// POST /api/v1/time-entries/clock-out
timeEntriesRouter.post('/clock-out', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const entry = await prisma.timeEntry.findFirst({
    where: { userId, tenantId, date: today, clockOut: null, clockIn: { not: null } },
    orderBy: { clockIn: 'desc' },
  });
  if (!entry) {
    res.status(400).json({ success: false, message: 'No active clock-in found.' }); return;
  }

  const now = new Date();
  const hours = Math.round(((now.getTime() - entry.clockIn!.getTime()) / 3_600_000) * 100) / 100;

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: { clockOut: now, hoursWorked: hours },
  });
  res.json({ success: true, data: updated } satisfies ApiResponse);
});
