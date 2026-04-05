import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const reviewsRouter = Router();

// ── Public routes (no auth) ───────────────────────────────────────────────────

// GET /api/v1/reviews/public/:token — load review form data
reviewsRouter.get('/public/:token', async (req, res) => {
  const review = await prisma.jobReview.findUnique({
    where: { reviewToken: req.params.token },
    include: {
      job: { select: { id: true, title: true, serviceType: true } },
      technician: { select: { firstName: true, lastName: true } },
    },
  });

  if (!review) {
    throw new AppError('Review link not found', 404, 'NOT_FOUND');
  }

  if (review.submittedAt) {
    return res.json({
      success: true,
      data: {
        alreadySubmitted: true,
        rating: review.rating,
        jobTitle: review.job.title,
      },
    } satisfies ApiResponse);
  }

  res.json({
    success: true,
    data: {
      alreadySubmitted: false,
      jobTitle: review.job.title,
      serviceType: review.job.serviceType,
      technicianName: review.technician
        ? `${review.technician.firstName} ${review.technician.lastName}`
        : null,
    },
  } satisfies ApiResponse);
});

// POST /api/v1/reviews/public/:token — submit rating
reviewsRouter.post('/public/:token', async (req, res) => {
  const {
    rating,
    comment,
    qualityScore,
    punctualityScore,
    communicationScore,
    valueScore,
    reviewerName,
  } = req.body as {
    rating: number;
    comment?: string;
    qualityScore?: number;
    punctualityScore?: number;
    communicationScore?: number;
    valueScore?: number;
    reviewerName?: string;
  };

  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be 1–5', 400, 'VALIDATION_ERROR');
  }

  const review = await prisma.jobReview.findUnique({
    where: { reviewToken: req.params.token },
  });

  if (!review) {
    throw new AppError('Review link not found', 404, 'NOT_FOUND');
  }
  if (review.submittedAt) {
    throw new AppError('This review has already been submitted', 400, 'ALREADY_SUBMITTED');
  }

  const updated = await prisma.jobReview.update({
    where: { reviewToken: req.params.token },
    data: {
      rating,
      comment,
      qualityScore,
      punctualityScore,
      communicationScore,
      valueScore,
      reviewerName,
      isVerified: true,
      submittedAt: new Date(),
    },
  });

  // Auto-award badges after review submission
  if (updated.technicianId) {
    awardBadgesIfEligible(updated.tenantId, updated.technicianId).catch(() => {});
  }

  res.json({ success: true, data: { rating: updated.rating, comment: updated.comment } } satisfies ApiResponse);
});

// ── Authenticated routes ──────────────────────────────────────────────────────

reviewsRouter.use(authenticate);
reviewsRouter.use(requireRole('owner', 'admin', 'dispatcher'));

// GET /api/v1/reviews — list submitted reviews
reviewsRouter.get('/', async (req, res) => {
  const { technicianId, limit = '20', page = '1' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    submittedAt: { not: null },
  };
  if (technicianId) where.technicianId = technicianId;

  const [reviews, total] = await Promise.all([
    prisma.jobReview.findMany({
      where,
      include: {
        job: { select: { title: true, serviceType: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.jobReview.count({ where }),
  ]);

  res.json({
    success: true,
    data: reviews,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// GET /api/v1/reviews/summary — avg rating per tech
reviewsRouter.get('/summary', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const technicians = await prisma.user.findMany({
    where: { tenantId, role: 'technician', status: 'active' },
    select: { id: true, firstName: true, lastName: true },
  });

  const summaries = await Promise.all(
    technicians.map(async (tech) => {
      const reviews = await prisma.jobReview.findMany({
        where: { tenantId, technicianId: tech.id, submittedAt: { not: null }, rating: { not: null } },
        select: { rating: true },
      });
      const avg = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length
        : null;
      return {
        technicianId: tech.id,
        name: `${tech.firstName} ${tech.lastName}`,
        avgRating: avg !== null ? Math.round(avg * 10) / 10 : null,
        totalReviews: reviews.length,
      };
    }),
  );

  // Overall avg
  const allReviews = await prisma.jobReview.aggregate({
    where: { tenantId, submittedAt: { not: null }, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  res.json({
    success: true,
    data: {
      overall: {
        avgRating: allReviews._avg.rating ? Math.round(allReviews._avg.rating * 10) / 10 : null,
        totalReviews: allReviews._count.rating,
      },
      byTechnician: summaries,
    },
  } satisfies ApiResponse);
});

// GET /api/v1/reviews/leaderboard — ranked technicians by avg rating
reviewsRouter.get('/leaderboard', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const technicians = await prisma.user.findMany({
    where: { tenantId, status: 'active' },
    select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true },
  });

  const rows = await Promise.all(
    technicians.map(async (tech) => {
      const reviews = await prisma.jobReview.findMany({
        where: { tenantId, technicianId: tech.id, submittedAt: { not: null }, rating: { not: null } },
        select: { rating: true, qualityScore: true, punctualityScore: true, communicationScore: true, valueScore: true },
      });
      if (reviews.length === 0) return null;
      const avg = (field: keyof typeof reviews[0]) => {
        const vals = reviews.map((r) => r[field] as number | null).filter((v): v is number => v !== null);
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      };
      const badges = await prisma.contractorBadge.findMany({
        where: { tenantId, userId: tech.id },
        select: { badgeType: true, awardedAt: true },
      });
      return {
        userId: tech.id,
        name: `${tech.firstName} ${tech.lastName}`,
        role: tech.role,
        avatarUrl: tech.avatarUrl,
        totalReviews: reviews.length,
        avgRating: avg('rating'),
        avgQuality: avg('qualityScore'),
        avgPunctuality: avg('punctualityScore'),
        avgCommunication: avg('communicationScore'),
        avgValue: avg('valueScore'),
        badges: badges.map((b) => b.badgeType),
      };
    }),
  );

  const ranked = rows
    .filter((r): r is NonNullable<typeof rows[0]> => r !== null)
    .sort((a, b) => (b?.avgRating ?? 0) - (a?.avgRating ?? 0));

  res.json({ success: true, data: ranked } satisfies ApiResponse);
});

// GET /api/v1/reviews/profile/:userId — public contractor profile
reviewsRouter.get('/profile/:userId', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, tenantId },
    select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true, createdAt: true },
  });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }

  const reviews = await prisma.jobReview.findMany({
    where: { tenantId, technicianId: req.params.userId, submittedAt: { not: null }, isPublic: true },
    include: { response: true },
    orderBy: { submittedAt: 'desc' },
    take: 50,
  });

  const badges = await prisma.contractorBadge.findMany({
    where: { tenantId, userId: req.params.userId },
  });

  const rated = reviews.filter((r) => r.rating !== null);
  const avg = (field: keyof typeof reviews[0]) => {
    const vals = reviews.map((r) => r[field] as number | null).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  res.json({
    success: true,
    data: {
      user,
      stats: {
        totalReviews: rated.length,
        avgRating: avg('rating'),
        avgQuality: avg('qualityScore'),
        avgPunctuality: avg('punctualityScore'),
        avgCommunication: avg('communicationScore'),
        avgValue: avg('valueScore'),
        ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({
          star,
          count: rated.filter((r) => r.rating === star).length,
        })),
      },
      badges,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewerName,
        qualityScore: r.qualityScore,
        punctualityScore: r.punctualityScore,
        communicationScore: r.communicationScore,
        valueScore: r.valueScore,
        submittedAt: r.submittedAt,
        response: r.response,
      })),
    },
  } satisfies ApiResponse);
});

// PATCH /api/v1/reviews/:id — flag or hide review (admin)
reviewsRouter.patch('/:id', async (req, res) => {
  const { isFlagged, isPublic } = req.body;
  const review = await prisma.jobReview.update({
    where: { id: req.params.id },
    data: { isFlagged, isPublic },
  });
  res.json({ success: true, data: review } satisfies ApiResponse);
});

// POST /api/v1/reviews/:id/response — add owner response to a review
reviewsRouter.post('/:id/response', async (req, res) => {
  const { body } = req.body as { body?: string };
  if (!body?.trim()) { res.status(400).json({ error: 'body is required' }); return; }
  const user = req.user!;
  const response = await prisma.reviewResponse.upsert({
    where: { reviewId: req.params.id },
    create: { reviewId: req.params.id, body: body.trim(), respondedBy: user.sub },
    update: { body: body.trim() },
  });
  res.status(201).json({ success: true, data: response } satisfies ApiResponse);
});

// POST /api/v1/reviews/:id/flag — flag for moderation
reviewsRouter.post('/:id/flag', async (req, res) => {
  await prisma.jobReview.update({ where: { id: req.params.id }, data: { isFlagged: true } });
  res.json({ success: true } satisfies ApiResponse);
});

// GET /api/v1/reviews/flagged — moderation queue
reviewsRouter.get('/flagged', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const reviews = await prisma.jobReview.findMany({
    where: { tenantId, isFlagged: true, submittedAt: { not: null } },
    include: {
      job: { select: { title: true, serviceType: true } },
      technician: { select: { firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });
  res.json({ success: true, data: reviews } satisfies ApiResponse);
});

// ─── Badge auto-award helper ──────────────────────────────────────────────────

async function awardBadgesIfEligible(tenantId: string, userId: string) {
  const reviews = await prisma.jobReview.findMany({
    where: { tenantId, technicianId: userId, submittedAt: { not: null }, rating: { not: null } },
    select: { rating: true },
  });
  if (reviews.length < 3) return;

  const avg = reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length;

  const existing = await prisma.contractorBadge.findMany({
    where: { tenantId, userId },
    select: { badgeType: true },
  });
  const has = new Set(existing.map((b) => b.badgeType));

  const toAward: string[] = [];
  if (avg >= 4.8 && !has.has('top_rated')) toAward.push('top_rated');
  if (reviews.length >= 10 && avg >= 5.0 && !has.has('perfect_score')) toAward.push('perfect_score');
  if (reviews.length >= 25 && !has.has('most_reviewed')) toAward.push('most_reviewed');

  if (toAward.length) {
    await prisma.contractorBadge.createMany({
      data: toAward.map((badgeType) => ({ tenantId, userId, badgeType })),
      skipDuplicates: true,
    });
  }
}
