import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const reportsRouter = Router();

reportsRouter.use(authenticate);
reportsRouter.use(requireRole('owner', 'admin', 'dispatcher'));

// GET /api/v1/reports/overview — KPI cards
reportsRouter.get('/overview', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const now = new Date();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    revenueMtdResult,
    revenueYtdResult,
    revenueAllTimeResult,
    jobsTotal,
    jobsCompleted,
    jobsScheduled,
    jobsInProgress,
    jobsEnRoute,
    jobsCancelled,
    customersTotal,
    customersActive,
    customersNew30d,
    invoicesOutstandingResult,
    invoicesOverdueResult,
  ] = await Promise.all([
    // Revenue: MTD
    prisma.payment.aggregate({
      where: { tenantId, paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    // Revenue: YTD
    prisma.payment.aggregate({
      where: { tenantId, paidAt: { gte: startOfYear } },
      _sum: { amount: true },
    }),
    // Revenue: all time
    prisma.payment.aggregate({
      where: { tenantId },
      _sum: { amount: true },
    }),
    // Jobs: total
    prisma.job.count({ where: { tenantId } }),
    // Jobs: completed
    prisma.job.count({ where: { tenantId, status: 'completed' } }),
    // Jobs: scheduled
    prisma.job.count({ where: { tenantId, status: 'scheduled' } }),
    // Jobs: in_progress
    prisma.job.count({ where: { tenantId, status: 'in_progress' } }),
    // Jobs: en_route (also counts as active)
    prisma.job.count({ where: { tenantId, status: 'en_route' } }),
    // Jobs: cancelled
    prisma.job.count({ where: { tenantId, status: 'cancelled' } }),
    // Customers: total
    prisma.customer.count({ where: { tenantId } }),
    // Customers: active
    prisma.customer.count({ where: { tenantId, status: 'active' } }),
    // Customers: new in last 30 days
    prisma.customer.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    // Invoices: outstanding (sent, viewed, overdue)
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: ['sent', 'viewed', 'overdue'] } },
      _sum: { amountDue: true },
    }),
    // Invoices: overdue
    prisma.invoice.aggregate({
      where: { tenantId, status: 'overdue' },
      _sum: { amountDue: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      revenue: {
        mtd: revenueMtdResult._sum.amount ?? 0,
        ytd: revenueYtdResult._sum.amount ?? 0,
        allTime: revenueAllTimeResult._sum.amount ?? 0,
      },
      jobs: {
        total: jobsTotal,
        completed: jobsCompleted,
        scheduled: jobsScheduled,
        inProgress: jobsInProgress + jobsEnRoute,
        cancelled: jobsCancelled,
      },
      customers: {
        total: customersTotal,
        active: customersActive,
        new30d: customersNew30d,
      },
      invoices: {
        outstanding: invoicesOutstandingResult._sum.amountDue ?? 0,
        overdue: invoicesOverdueResult._sum.amountDue ?? 0,
      },
    },
  } satisfies ApiResponse);
});

// GET /api/v1/reports/monthly — last 12 months revenue + job counts
reportsRouter.get('/monthly', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const now = new Date();

  // Go back exactly 12 months from the start of the current month
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [payments, jobs] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, paidAt: { gte: twelveMonthsAgo } },
      select: { amount: true, paidAt: true },
    }),
    prisma.job.findMany({
      where: {
        tenantId,
        status: 'completed',
        actualEnd: { gte: twelveMonthsAgo },
      },
      select: { actualEnd: true },
    }),
  ]);

  // Build a map of YYYY-MM => { revenue, jobs }
  const monthMap = new Map<string, { revenue: number; jobs: number }>();

  // Pre-populate all 12 months so we always return a full array
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, { revenue: 0, jobs: 0 });
  }

  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const d = new Date(payment.paidAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthMap.get(key);
    if (entry) {
      entry.revenue += payment.amount;
    }
  }

  for (const job of jobs) {
    if (!job.actualEnd) continue;
    const d = new Date(job.actualEnd);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthMap.get(key);
    if (entry) {
      entry.jobs += 1;
    }
  }

  const result = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    jobs: data.jobs,
  }));

  res.json({ success: true, data: result } satisfies ApiResponse);
});

// GET /api/v1/reports/technicians — technician performance
reportsRouter.get('/technicians', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const technicians = await prisma.user.findMany({
    where: { tenantId, role: 'technician', status: 'active' },
    select: { id: true, firstName: true, lastName: true },
  });

  const techStats = await Promise.all(
    technicians.map(async (tech) => {
      const [jobsCompleted, jobsScheduled, completedJobsWithDuration] = await Promise.all([
        prisma.job.count({
          where: { tenantId, technicianId: tech.id, status: 'completed' },
        }),
        prisma.job.count({
          where: { tenantId, technicianId: tech.id, status: 'scheduled' },
        }),
        prisma.job.findMany({
          where: {
            tenantId,
            technicianId: tech.id,
            actualStart: { not: null },
            actualEnd: { not: null },
          },
          select: { actualStart: true, actualEnd: true },
        }),
      ]);

      let avgDurationMinutes = 0;
      if (completedJobsWithDuration.length > 0) {
        const totalMinutes = completedJobsWithDuration.reduce((sum, job) => {
          const start = new Date(job.actualStart!).getTime();
          const end = new Date(job.actualEnd!).getTime();
          return sum + (end - start) / (1000 * 60);
        }, 0);
        avgDurationMinutes = Math.round(totalMinutes / completedJobsWithDuration.length);
      }

      return {
        id: tech.id,
        firstName: tech.firstName,
        lastName: tech.lastName,
        jobsCompleted,
        jobsScheduled,
        avgDurationMinutes,
      };
    }),
  );

  res.json({ success: true, data: techStats } satisfies ApiResponse);
});
