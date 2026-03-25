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
  const { rating, comment } = req.body as { rating: number; comment?: string };

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
    data: { rating, comment, submittedAt: new Date() },
  });

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
