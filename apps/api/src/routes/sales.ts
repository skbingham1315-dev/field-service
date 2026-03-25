import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const salesRouter = Router();

salesRouter.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Goals ─────────────────────────────────────────────────────────────────────

// GET /api/v1/sales/goals
salesRouter.get('/goals', async (req, res) => {
  const goal = await prisma.salesGoal.findUnique({
    where: { tenantId: req.user!.tenantId },
  });
  // Return defaults if not yet set
  const defaults = { doorsKnocked: 20, peopleContacted: 10, estimatesGiven: 5, leadsAdded: 3, jobsScheduled: 2 };
  res.json({ success: true, data: goal ?? { ...defaults, tenantId: req.user!.tenantId } } satisfies ApiResponse);
});

// PATCH /api/v1/sales/goals — owner/admin only
salesRouter.patch('/goals', requireRole('owner', 'admin'), async (req, res) => {
  const { doorsKnocked, peopleContacted, estimatesGiven, leadsAdded, jobsScheduled } = req.body as {
    doorsKnocked: number;
    peopleContacted: number;
    estimatesGiven: number;
    leadsAdded: number;
    jobsScheduled: number;
  };
  const goal = await prisma.salesGoal.upsert({
    where: { tenantId: req.user!.tenantId },
    update: { doorsKnocked, peopleContacted, estimatesGiven, leadsAdded, jobsScheduled },
    create: { tenantId: req.user!.tenantId, doorsKnocked, peopleContacted, estimatesGiven, leadsAdded, jobsScheduled },
  });
  res.json({ success: true, data: goal } satisfies ApiResponse);
});

// ── Activity ──────────────────────────────────────────────────────────────────

// GET /api/v1/sales/activity?date=YYYY-MM-DD&userId=
salesRouter.get('/activity', async (req, res) => {
  const { date, userId } = req.query as { date?: string; userId?: string };
  const targetDate = date ? new Date(date) : todayDate();
  targetDate.setHours(0, 0, 0, 0);

  // Sales reps can only view their own activity
  const targetUserId = req.user!.role === 'sales' ? req.user!.sub : (userId ?? req.user!.sub);

  const activity = await prisma.salesActivity.findUnique({
    where: { userId_date: { userId: targetUserId, date: targetDate } },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  res.json({ success: true, data: activity } satisfies ApiResponse);
});

// POST /api/v1/sales/activity — upsert today's activity
salesRouter.post('/activity', async (req, res) => {
  const { doorsKnocked, peopleContacted, estimatesGiven, leadsAdded, jobsScheduled, notes } = req.body as {
    doorsKnocked?: number;
    peopleContacted?: number;
    estimatesGiven?: number;
    leadsAdded?: number;
    jobsScheduled?: number;
    notes?: string;
  };

  const userId = req.user!.role === 'sales' ? req.user!.sub : (req.body.userId ?? req.user!.sub);
  const date = todayDate();

  const activity = await prisma.salesActivity.upsert({
    where: { userId_date: { userId, date } },
    update: {
      ...(doorsKnocked !== undefined && { doorsKnocked }),
      ...(peopleContacted !== undefined && { peopleContacted }),
      ...(estimatesGiven !== undefined && { estimatesGiven }),
      ...(leadsAdded !== undefined && { leadsAdded }),
      ...(jobsScheduled !== undefined && { jobsScheduled }),
      ...(notes !== undefined && { notes }),
    },
    create: {
      tenantId: req.user!.tenantId,
      userId,
      date,
      doorsKnocked: doorsKnocked ?? 0,
      peopleContacted: peopleContacted ?? 0,
      estimatesGiven: estimatesGiven ?? 0,
      leadsAdded: leadsAdded ?? 0,
      jobsScheduled: jobsScheduled ?? 0,
      notes,
    },
  });

  res.json({ success: true, data: activity } satisfies ApiResponse);
});

// GET /api/v1/sales/leaderboard?startDate=&endDate= — management only
salesRouter.get('/leaderboard', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const end = endDate ? new Date(endDate) : now;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const activities = await prisma.salesActivity.findMany({
    where: {
      tenantId: req.user!.tenantId,
      date: { gte: start, lte: end },
    },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
  });

  // Aggregate per user
  const byUser = new Map<string, {
    userId: string; name: string; role: string;
    doorsKnocked: number; peopleContacted: number; estimatesGiven: number;
    leadsAdded: number; jobsScheduled: number; daysActive: number;
  }>();

  for (const a of activities) {
    const key = a.userId;
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: a.user.id,
        name: `${a.user.firstName} ${a.user.lastName}`,
        role: a.user.role,
        doorsKnocked: 0, peopleContacted: 0, estimatesGiven: 0,
        leadsAdded: 0, jobsScheduled: 0, daysActive: 0,
      });
    }
    const entry = byUser.get(key)!;
    entry.doorsKnocked += a.doorsKnocked;
    entry.peopleContacted += a.peopleContacted;
    entry.estimatesGiven += a.estimatesGiven;
    entry.leadsAdded += a.leadsAdded;
    entry.jobsScheduled += a.jobsScheduled;
    entry.daysActive += 1;
  }

  const result = Array.from(byUser.values()).sort((a, b) => b.doorsKnocked - a.doorsKnocked);
  res.json({ success: true, data: result } satisfies ApiResponse);
});
