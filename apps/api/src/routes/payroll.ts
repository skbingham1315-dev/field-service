import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const payrollRouter = Router();
payrollRouter.use(authenticate);
payrollRouter.use(requireRole('owner', 'admin'));

// GET /api/v1/payroll
payrollRouter.get('/', async (req, res) => {
  const runs = await prisma.payrollRun.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { periodStart: 'desc' },
    include: {
      entries: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  res.json({ success: true, data: runs } satisfies ApiResponse);
});

// POST /api/v1/payroll — create a new payroll run from time entries in date range
payrollRouter.post('/', async (req, res) => {
  const { periodStart, periodEnd, notes } = req.body as { periodStart: string; periodEnd: string; notes?: string };
  const { tenantId, sub: userId } = req.user!;

  if (!periodStart || !periodEnd) {
    res.status(400).json({ success: false, message: 'periodStart and periodEnd required' }); return;
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Get all approved (or pending) time entries in the period
  const entries = await prisma.timeEntry.findMany({
    where: { tenantId, date: { gte: start, lte: end }, status: { in: ['pending', 'approved'] } },
    include: { user: { select: { id: true, firstName: true, lastName: true, payRate: true, payType: true } } },
  });

  // Group by user
  const byUser: Record<string, { user: typeof entries[0]['user']; hours: number }> = {};
  for (const e of entries) {
    if (!byUser[e.userId]) byUser[e.userId] = { user: e.user, hours: 0 };
    byUser[e.userId].hours += e.hoursWorked;
  }

  // Build payroll entries
  const payrollEntries = Object.values(byUser).map(({ user, hours }) => {
    const rate = user.payRate ?? 0;
    const type = user.payType ?? 'hourly';
    const regular = Math.min(hours, 40);
    const overtime = Math.max(hours - 40, 0);
    const grossPay = type === 'salary'
      ? rate / 52  // weekly salary slice
      : regular * rate + overtime * rate * 1.5;
    return {
      userId: user.id,
      regularHours: regular,
      overtimeHours: overtime,
      payRate: rate,
      payType: type,
      grossPay: Math.round(grossPay * 100) / 100,
    };
  });

  const totalGross = payrollEntries.reduce((s, e) => s + e.grossPay, 0);

  const run = await prisma.payrollRun.create({
    data: {
      tenantId,
      periodStart: start,
      periodEnd: end,
      notes: notes || null,
      createdById: userId,
      totalGross: Math.round(totalGross * 100) / 100,
      entries: { create: payrollEntries },
    },
    include: {
      entries: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } },
    },
  });

  res.status(201).json({ success: true, data: run } satisfies ApiResponse);
});

// GET /api/v1/payroll/:id
payrollRouter.get('/:id', async (req, res) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: req.params.id },
    include: {
      entries: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true, payRate: true, payType: true } },
        },
      },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!run || run.tenantId !== req.user!.tenantId) {
    res.status(404).json({ success: false, message: 'Not found' }); return;
  }
  res.json({ success: true, data: run } satisfies ApiResponse);
});

// POST /api/v1/payroll/:id/approve — approve all pending time entries in the period
payrollRouter.post('/:id/approve', async (req, res) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run || run.tenantId !== req.user!.tenantId) {
    res.status(404).json({ success: false, message: 'Not found' }); return;
  }
  await Promise.all([
    prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'approved' } }),
    prisma.timeEntry.updateMany({
      where: { tenantId: run.tenantId, date: { gte: run.periodStart, lte: run.periodEnd }, status: 'pending' },
      data: { status: 'approved' },
    }),
  ]);
  res.json({ success: true, data: { message: 'Payroll approved' } } satisfies ApiResponse);
});

// POST /api/v1/payroll/:id/mark-paid
payrollRouter.post('/:id/mark-paid', async (req, res) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run || run.tenantId !== req.user!.tenantId) {
    res.status(404).json({ success: false, message: 'Not found' }); return;
  }
  await Promise.all([
    prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'paid', paidAt: new Date() } }),
    prisma.timeEntry.updateMany({
      where: { tenantId: run.tenantId, date: { gte: run.periodStart, lte: run.periodEnd }, status: 'approved' },
      data: { status: 'paid' },
    }),
  ]);
  res.json({ success: true, data: { message: 'Payroll marked as paid' } } satisfies ApiResponse);
});
