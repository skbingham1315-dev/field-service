import { Router } from 'express';
import Papa from 'papaparse';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const compensationRouter = Router();
compensationRouter.use(authenticate);

// ── Commission calculation helper ─────────────────────────────────────────────

type PayComponentConfig = {
  percentage?: number;
  basis?: string;     // gross | net
  trigger?: string;   // approved | invoiced | paid
  amount?: number;
  tiers?: Array<{ min: number; max: number | null; pct: number }>;
};

export async function triggerCommission(jobId: string, tenantId: string): Promise<void> {
  const job = await prisma.cRMJob.findUnique({
    where: { id: jobId },
    include: {
      primarySales: { include: { payComponents: { where: { isActive: true } } } },
      secondarySales: { include: { payComponents: { where: { isActive: true } } } },
    },
  });

  if (!job || job.commissionTriggered) return;

  const invoiceAmt = Number(job.actualInvoiceAmount ?? job.estimatedValue ?? 0);
  const subCost = Number(job.subPaymentAmount ?? 0);
  const matCost = Number(job.materialsCost ?? 0);
  const otherCost = Number(job.otherCosts ?? 0);
  const netValue = Math.max(0, invoiceAmt - subCost - matCost - otherCost);

  const credited: Array<{ user: typeof job.primarySales; pct: number }> = [];
  if (job.primarySales) credited.push({ user: job.primarySales, pct: Number(job.primarySalesPct ?? 100) });
  if (job.secondarySales) credited.push({ user: job.secondarySales, pct: Number(job.secondarySalesPct ?? 0) });

  const entries: Array<Parameters<typeof prisma.commissionEntry.create>[0]['data']> = [];

  for (const { user, pct } of credited) {
    if (!user || pct <= 0) continue;
    const creditedValue = invoiceAmt * (pct / 100);
    const creditedNet = netValue * (pct / 100);

    for (const comp of user.payComponents) {
      const cfg = comp.config as PayComponentConfig;
      let amount = 0;
      let payType = comp.type;

      if (comp.type === 'commission_flat') {
        amount = cfg.amount ?? 0;
        payType = 'commission_flat';
      } else if (comp.type === 'commission_pct') {
        const basis = cfg.basis === 'net' ? creditedNet : creditedValue;
        amount = basis * ((cfg.percentage ?? 0) / 100);
        payType = 'commission_pct';
      } else if (comp.type === 'commission_tiered') {
        const basis = cfg.basis === 'net' ? creditedNet : creditedValue;
        const tiers = cfg.tiers ?? [];
        for (const tier of tiers) {
          if (basis >= tier.min && (tier.max === null || basis <= tier.max)) {
            amount = basis * (tier.pct / 100);
            break;
          }
        }
        payType = 'commission_tiered';
      } else {
        continue; // non-commission pay types handled in payroll run
      }

      if (amount <= 0) continue;

      entries.push({
        tenantId,
        userId: user.id,
        crmJobId: jobId,
        payComponentId: comp.id,
        creditPct: pct,
        jobValue: invoiceAmt,
        amount,
        payType,
        status: 'pending',
      });
    }
  }

  if (entries.length > 0) {
    await prisma.$transaction([
      ...entries.map(e => prisma.commissionEntry.create({ data: e })),
      prisma.cRMJob.update({ where: { id: jobId }, data: { commissionTriggered: true } }),
    ]);
  } else {
    await prisma.cRMJob.update({ where: { id: jobId }, data: { commissionTriggered: true } });
  }
}

// ── Pay Components ────────────────────────────────────────────────────────────

// GET /compensation/pay-components?userId=
compensationRouter.get('/pay-components', requireRole('owner', 'admin'), async (req, res) => {
  const { userId } = req.query as { userId?: string };
  const where: Record<string, unknown> = { tenantId: req.user!.tenantId };
  if (userId) where.userId = userId;

  const components = await prisma.payComponent.findMany({
    where,
    orderBy: { effectiveDate: 'desc' },
  });
  res.json({ success: true, data: components } satisfies ApiResponse);
});

// POST /compensation/pay-components
compensationRouter.post('/pay-components', requireRole('owner', 'admin'), async (req, res) => {
  const { userId, type, label, config, effectiveDate, endDate } = req.body as {
    userId: string; type: string; label?: string;
    config: Record<string, unknown>; effectiveDate?: string; endDate?: string;
  };

  if (!userId || !type) throw new AppError('userId and type are required', 400, 'VALIDATION_ERROR');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== req.user!.tenantId) throw new AppError('User not found', 404, 'NOT_FOUND');

  const comp = await prisma.payComponent.create({
    data: {
      tenantId: req.user!.tenantId,
      userId, type, label,
      config: config as never,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
    },
  });
  res.status(201).json({ success: true, data: comp } satisfies ApiResponse);
});

// PATCH /compensation/pay-components/:id
compensationRouter.patch('/pay-components/:id', requireRole('owner', 'admin'), async (req, res) => {
  const comp = await prisma.payComponent.findUnique({ where: { id: req.params.id } });
  if (!comp || comp.tenantId !== req.user!.tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');

  const { label, config, effectiveDate, endDate, isActive } = req.body;
  const updated = await prisma.payComponent.update({
    where: { id: req.params.id },
    data: {
      label,
      config: config as never,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      isActive,
    },
  });
  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// DELETE /compensation/pay-components/:id
compensationRouter.delete('/pay-components/:id', requireRole('owner', 'admin'), async (req, res) => {
  const comp = await prisma.payComponent.findUnique({ where: { id: req.params.id } });
  if (!comp || comp.tenantId !== req.user!.tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');

  await prisma.payComponent.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { message: 'Deleted' } } satisfies ApiResponse);
});

// ── Earnings ──────────────────────────────────────────────────────────────────

// GET /compensation/earnings/:userId?period=this_month&start=&end=
compensationRouter.get('/earnings/:userId', async (req, res) => {
  const { userId } = req.params;
  const { period = 'this_month', start, end } = req.query as Record<string, string>;

  // Only admin/owner OR the user themselves
  if (req.user!.role !== 'owner' && req.user!.role !== 'admin' && req.user!.sub !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== req.user!.tenantId) throw new AppError('User not found', 404, 'NOT_FOUND');

  const now = new Date();
  let dateStart: Date, dateEnd: Date;

  if (start && end) {
    dateStart = new Date(start);
    dateEnd = new Date(end);
  } else if (period === 'this_week') {
    const dow = now.getDay();
    dateStart = new Date(now); dateStart.setDate(now.getDate() - dow); dateStart.setHours(0,0,0,0);
    dateEnd = new Date(); dateEnd.setHours(23,59,59,999);
  } else if (period === 'last_month') {
    dateStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    dateEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  } else if (period === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3);
    dateStart = new Date(now.getFullYear(), q * 3, 1);
    dateEnd = new Date();
  } else {
    // this_month default
    dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    dateEnd = new Date(); dateEnd.setHours(23,59,59,999);
  }

  const entries = await prisma.commissionEntry.findMany({
    where: {
      tenantId: req.user!.tenantId,
      userId,
      createdAt: { gte: dateStart, lte: dateEnd },
    },
    include: {
      crmJob: {
        select: { id: true, jobNumber: true, name: true, estimatedValue: true, actualInvoiceAmount: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalCommission = entries.reduce((s, e) => s + Number(e.amount), 0);
  const totalRevenue = entries.reduce((s, e) => s + Number(e.jobValue) * Number(e.creditPct) / 100, 0);
  const jobsCount = new Set(entries.map(e => e.crmJobId)).size;

  res.json({
    success: true,
    data: {
      userId,
      period: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
      summary: { jobsCount, totalRevenueCredited: totalRevenue, totalCommission },
      entries,
    },
  } satisfies ApiResponse);
});

// GET /compensation/earnings/:userId/export
compensationRouter.get('/earnings/:userId/export', async (req, res) => {
  const { userId } = req.params;
  const { start, end } = req.query as Record<string, string>;

  if (req.user!.role !== 'owner' && req.user!.role !== 'admin' && req.user!.sub !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const entries = await prisma.commissionEntry.findMany({
    where: {
      tenantId: req.user!.tenantId,
      userId,
      ...(start && end ? { createdAt: { gte: new Date(start), lte: new Date(end) } } : {}),
    },
    include: { crmJob: { select: { jobNumber: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const rows = entries.map(e => ({
    date: e.createdAt.toISOString().split('T')[0],
    jobNumber: e.crmJob.jobNumber,
    jobName: e.crmJob.name,
    jobValue: Number(e.jobValue).toFixed(2),
    creditPct: Number(e.creditPct),
    yourRevenue: (Number(e.jobValue) * Number(e.creditPct) / 100).toFixed(2),
    payType: e.payType,
    amountEarned: Number(e.amount).toFixed(2),
    status: e.status,
  }));

  const csv = Papa.unparse(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="earnings_${userId}_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

// ── Sales Targets ─────────────────────────────────────────────────────────────

compensationRouter.get('/targets', requireRole('owner', 'admin'), async (req, res) => {
  const now = new Date();
  const targets = await prisma.salesTarget.findMany({
    where: { tenantId: req.user!.tenantId, endDate: { gte: now } },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { startDate: 'asc' },
  });
  res.json({ success: true, data: targets } satisfies ApiResponse);
});

compensationRouter.post('/targets', requireRole('owner', 'admin'), async (req, res) => {
  const { userId, targetAmount, period, startDate, endDate } = req.body as {
    userId: string; targetAmount: number; period: string; startDate: string; endDate: string;
  };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== req.user!.tenantId) throw new AppError('User not found', 404, 'NOT_FOUND');

  const target = await prisma.salesTarget.create({
    data: {
      tenantId: req.user!.tenantId,
      userId,
      targetAmount,
      period,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
  res.status(201).json({ success: true, data: target } satisfies ApiResponse);
});

compensationRouter.patch('/targets/:id', requireRole('owner', 'admin'), async (req, res) => {
  const t = await prisma.salesTarget.findUnique({ where: { id: req.params.id } });
  if (!t || t.tenantId !== req.user!.tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');

  const { targetAmount, startDate, endDate } = req.body;
  const updated = await prisma.salesTarget.update({
    where: { id: req.params.id },
    data: {
      targetAmount,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
  });
  res.json({ success: true, data: updated } satisfies ApiResponse);
});

compensationRouter.delete('/targets/:id', requireRole('owner', 'admin'), async (req, res) => {
  const t = await prisma.salesTarget.findUnique({ where: { id: req.params.id } });
  if (!t || t.tenantId !== req.user!.tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');
  await prisma.salesTarget.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { message: 'Deleted' } } satisfies ApiResponse);
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

// GET /compensation/leaderboard?period=this_month
compensationRouter.get('/leaderboard', requireRole('owner', 'admin'), async (req, res) => {
  const { period = 'this_month' } = req.query as { period?: string };
  const now = new Date();

  let dateStart: Date;
  if (period === 'this_week') {
    dateStart = new Date(now); dateStart.setDate(now.getDate() - now.getDay()); dateStart.setHours(0,0,0,0);
  } else if (period === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3);
    dateStart = new Date(now.getFullYear(), q * 3, 1);
  } else if (period === 'this_year') {
    dateStart = new Date(now.getFullYear(), 0, 1);
  } else {
    dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const salesUsers = await prisma.user.findMany({
    where: { tenantId: req.user!.tenantId, role: { in: ['sales', 'admin', 'owner'] }, status: 'active' },
    select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true },
  });

  const tenantId = req.user!.tenantId;

  const leaderboard = await Promise.all(salesUsers.map(async (user) => {
    const [jobs, commissions, targets] = await Promise.all([
      prisma.cRMJob.findMany({
        where: {
          tenantId,
          primarySalesId: user.id,
          isArchived: false,
          createdAt: { gte: dateStart },
        },
        select: { id: true, status: true, actualInvoiceAmount: true, estimatedValue: true, primarySalesPct: true },
      }),
      prisma.commissionEntry.aggregate({
        where: { tenantId, userId: user.id, createdAt: { gte: dateStart } },
        _sum: { amount: true },
      }),
      prisma.salesTarget.findFirst({
        where: {
          tenantId,
          userId: user.id,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    const wonStatuses = ['approved', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid'];
    const wonJobs = jobs.filter(j => wonStatuses.includes(j.status));
    const totalRevenue = wonJobs.reduce((s, j) => {
      const v = Number(j.actualInvoiceAmount ?? j.estimatedValue ?? 0);
      return s + v * (Number(j.primarySalesPct ?? 100) / 100);
    }, 0);
    const sentJobs = jobs.filter(j => j.status !== 'estimate_pending' && j.status !== 'cancelled');
    const winRate = sentJobs.length > 0 ? Math.round((wonJobs.length / sentJobs.length) * 100) : 0;

    return {
      user,
      jobsWon: wonJobs.length,
      totalRevenue,
      winRate,
      commissionEarned: Number(commissions._sum.amount ?? 0),
      target: targets ? { amount: Number(targets.targetAmount), start: targets.startDate, end: targets.endDate } : null,
    };
  }));

  leaderboard.sort((a, b) => b.totalRevenue - a.totalRevenue);
  res.json({ success: true, data: leaderboard } satisfies ApiResponse);
});

// GET /compensation/leaderboard/:userId/stats
compensationRouter.get('/leaderboard/:userId/stats', requireRole('owner', 'admin'), async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user!.tenantId;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== tenantId) throw new AppError('User not found', 404, 'NOT_FOUND');

  const jobs = await prisma.cRMJob.findMany({
    where: { tenantId, primarySalesId: userId, isArchived: false },
    select: { id: true, status: true, actualInvoiceAmount: true, estimatedValue: true, primarySalesPct: true, createdAt: true },
  });

  const byStatus: Record<string, number> = {};
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  }

  const wonStatuses = ['approved', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid'];
  const wonJobs = jobs.filter(j => wonStatuses.includes(j.status));
  const avgValue = wonJobs.length > 0
    ? wonJobs.reduce((s, j) => s + Number(j.actualInvoiceAmount ?? j.estimatedValue ?? 0), 0) / wonJobs.length
    : 0;

  // Monthly revenue last 6 months
  const monthly: Record<string, number> = {};
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1);
  for (const j of wonJobs) {
    if (j.createdAt < sixMonthsAgo) continue;
    const key = `${j.createdAt.getFullYear()}-${String(j.createdAt.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = (monthly[key] ?? 0) + Number(j.actualInvoiceAmount ?? j.estimatedValue ?? 0);
  }

  res.json({
    success: true,
    data: { byStatus, jobsWon: wonJobs.length, avgJobValue: avgValue, monthlyRevenue: monthly },
  } satisfies ApiResponse);
});

// ── Payroll Preview ───────────────────────────────────────────────────────────

// POST /compensation/payroll/preview { periodStart, periodEnd }
compensationRouter.post('/payroll/preview', requireRole('owner', 'admin'), async (req, res) => {
  const { periodStart, periodEnd } = req.body as { periodStart: string; periodEnd: string };
  if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400, 'VALIDATION_ERROR');

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const tenantId = req.user!.tenantId;

  const users = await prisma.user.findMany({
    where: { tenantId, status: 'active', role: { in: ['owner', 'admin', 'dispatcher', 'technician', 'sales'] } },
    include: { payComponents: { where: { isActive: true } } },
    orderBy: { firstName: 'asc' },
  });

  const preview = await Promise.all(users.map(async (user) => {
    const commissions = await prisma.commissionEntry.findMany({
      where: { tenantId, userId: user.id, status: 'pending', createdAt: { gte: start, lte: end } },
    });

    const commissionTotal = commissions.reduce((s, e) => s + Number(e.amount), 0);

    // Calculate base pay from pay components
    let basePay = 0;
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const weeks = days / 7;

    for (const comp of user.payComponents) {
      const cfg = comp.config as PayComponentConfig & { annualAmount?: number; frequency?: string; rate?: number };
      if (comp.type === 'salary' && cfg.annualAmount) {
        const freq = cfg.frequency ?? 'biweekly';
        const periods = freq === 'weekly' ? 52 : freq === 'biweekly' ? 26 : freq === 'semimonthly' ? 24 : 12;
        basePay += (cfg.annualAmount / periods) * (weeks / (52 / periods));
      } else if (comp.type === 'hourly' && cfg.rate) {
        // Requires time entries — just show rate as reference
        basePay += 0; // populated from time entries
      } else if (comp.type === 'draw' && cfg.amount) {
        basePay += cfg.amount * weeks;
      }
    }

    const timeEntries = await prisma.timeEntry.aggregate({
      where: { tenantId, userId: user.id, date: { gte: start, lte: end } },
      _sum: { hoursWorked: true },
    });
    const hours = Number(timeEntries._sum?.hoursWorked ?? 0);

    // Hourly pay from time entries
    const hourlyComp = user.payComponents.find(c => c.type === 'hourly');
    if (hourlyComp && hours > 0) {
      const cfg = hourlyComp.config as { rate?: number; overtimeThreshold?: number; overtimeMultiplier?: number };
      const otThreshold = cfg.overtimeThreshold ?? 40;
      const otMult = cfg.overtimeMultiplier ?? 1.5;
      const regularHrs = Math.min(hours, otThreshold * weeks);
      const otHrs = Math.max(0, hours - regularHrs);
      basePay += regularHrs * (cfg.rate ?? 0) + otHrs * (cfg.rate ?? 0) * otMult;
    }

    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      payType: user.payType ?? 'hourly',
      payRate: user.payRate ?? 0,
      hoursLogged: hours,
      basePay: Math.round(basePay * 100) / 100,
      commissions: Math.round(commissionTotal * 100) / 100,
      totalGross: Math.round((basePay + commissionTotal) * 100) / 100,
      commissionEntryIds: commissions.map(c => c.id),
    };
  }));

  res.json({ success: true, data: { periodStart, periodEnd, entries: preview } } satisfies ApiResponse);
});

// POST /compensation/payroll/finalize
compensationRouter.post('/payroll/finalize', requireRole('owner', 'admin'), async (req, res) => {
  const { periodStart, periodEnd, entries, notes } = req.body as {
    periodStart: string;
    periodEnd: string;
    notes?: string;
    entries: Array<{
      userId: string;
      basePay: number;
      commissions: number;
      totalGross: number;
      hoursLogged: number;
      overrideNote?: string;
      commissionEntryIds: string[];
    }>;
  };

  const tenantId = req.user!.tenantId;

  // Create payroll run
  const run = await prisma.payrollRun.create({
    data: {
      tenantId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      status: 'approved',
      totalGross: entries.reduce((s, e) => s + e.totalGross, 0),
      notes,
      createdById: req.user!.sub,
      paidAt: new Date(),
    },
  });

  // Create payroll entries and finalize commission entries
  await prisma.$transaction([
    ...entries.map(e => prisma.payrollEntry.create({
      data: {
        payrollRunId: run.id,
        userId: e.userId,
        regularHours: e.hoursLogged,
        overtimeHours: 0,
        payRate: e.basePay,
        payType: 'mixed',
        grossPay: e.totalGross,
        notes: e.overrideNote,
      },
    })),
    prisma.commissionEntry.updateMany({
      where: { id: { in: entries.flatMap(e => e.commissionEntryIds) } },
      data: { status: 'finalized', payRunId: run.id },
    }),
  ]);

  res.status(201).json({ success: true, data: { payRunId: run.id } } satisfies ApiResponse);
});

// GET /compensation/payroll/export/:payRunId
compensationRouter.get('/payroll/export/:payRunId', requireRole('owner', 'admin'), async (req, res) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: req.params.payRunId },
    include: {
      entries: {
        include: { user: { select: { firstName: true, lastName: true, role: true, email: true } } },
      },
    },
  });
  if (!run || run.tenantId !== req.user!.tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');

  const rows = run.entries.map(e => ({
    name: `${e.user.firstName} ${e.user.lastName}`,
    email: e.user.email,
    role: e.user.role,
    hoursLogged: e.regularHours,
    basePay: e.payRate.toFixed(2),
    grossPay: e.grossPay.toFixed(2),
    notes: e.notes ?? '',
  }));

  const csv = Papa.unparse(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="payroll_${run.periodStart.toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});
