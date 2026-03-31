import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const subcontractorsRouter = Router();
subcontractorsRouter.use(authenticate);

// ── List ──────────────────────────────────────────────────────────────────────

subcontractorsRouter.get('/', async (req, res) => {
  const { search, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId, isArchived: false };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  const [subs, total] = await Promise.all([
    prisma.subcontractor.findMany({
      where,
      include: {
        _count: { select: { crmJobs: true } },
        crmJobs: {
          where: { isArchived: false },
          select: { id: true, actualInvoiceAmount: true, subPaymentAmount: true, subPaymentPercent: true, subPaymentType: true, status: true },
        },
      },
      orderBy: { name: 'asc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.subcontractor.count({ where }),
  ]);

  res.json({
    success: true,
    data: subs,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// ── Get one ───────────────────────────────────────────────────────────────────

subcontractorsRouter.get('/:id', async (req, res) => {
  const sub = await prisma.subcontractor.findUnique({
    where: { id: req.params.id },
    include: {
      crmJobs: {
        where: { isArchived: false },
        include: { contact: { select: { id: true, fullName: true, businessName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!sub || sub.tenantId !== req.user!.tenantId) {
    throw new AppError('Subcontractor not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data: sub } satisfies ApiResponse);
});

// ── Create ────────────────────────────────────────────────────────────────────

subcontractorsRouter.post('/', async (req, res) => {
  const {
    name, contactName, phone, email, licenseNumber,
    insuranceExpDate, tradeSpecialties, defaultRateType,
    defaultPercentage, notes, reliabilityRating,
  } = req.body;

  if (!name) throw new AppError('name is required', 400, 'VALIDATION_ERROR');
  if (!phone) throw new AppError('phone is required', 400, 'VALIDATION_ERROR');

  const sub = await prisma.subcontractor.create({
    data: {
      tenantId: req.user!.tenantId,
      name, contactName, phone, email, licenseNumber,
      insuranceExpDate: insuranceExpDate ? new Date(insuranceExpDate) : undefined,
      tradeSpecialties: tradeSpecialties ?? [],
      defaultRateType, defaultPercentage, notes,
      reliabilityRating: reliabilityRating ? parseInt(reliabilityRating) : undefined,
    },
  });

  res.status(201).json({ success: true, data: sub } satisfies ApiResponse);
});

// ── Update ────────────────────────────────────────────────────────────────────

subcontractorsRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.subcontractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Subcontractor not found', 404, 'NOT_FOUND');
  }

  const { insuranceExpDate, reliabilityRating, ...rest } = req.body;

  const sub = await prisma.subcontractor.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      insuranceExpDate: insuranceExpDate ? new Date(insuranceExpDate) : undefined,
      reliabilityRating: reliabilityRating !== undefined ? parseInt(reliabilityRating) : undefined,
    },
  });

  res.json({ success: true, data: sub } satisfies ApiResponse);
});

// ── Archive ───────────────────────────────────────────────────────────────────

subcontractorsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.subcontractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Subcontractor not found', 404, 'NOT_FOUND');
  }
  await prisma.subcontractor.update({ where: { id: req.params.id }, data: { isArchived: true } });
  res.json({ success: true, data: { message: 'Subcontractor archived' } } satisfies ApiResponse);
});
