import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../socket';
import type { ApiResponse } from '@fsp/types';
import { DEFAULT_ROLE_PERMISSIONS } from './tenants';
import { sendSms } from '../lib/sms';
import { sendJobReviewRequest } from '../lib/email';

export const jobsRouter = Router();

jobsRouter.use(authenticate);

async function getTenantPermissions(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const saved = (settings.rolePermissions ?? {}) as Record<string, Record<string, boolean>>;
  return {
    technician: { ...DEFAULT_ROLE_PERMISSIONS.technician, ...(saved.technician ?? {}) },
    sales: { ...DEFAULT_ROLE_PERMISSIONS.sales, ...(saved.sales ?? {}) },
    dispatcher: { ...DEFAULT_ROLE_PERMISSIONS.dispatcher, ...(saved.dispatcher ?? {}) },
  };
}

// GET /api/v1/jobs
jobsRouter.get('/', async (req, res) => {
  const {
    status,
    technicianId,
    customerId,
    startDate,
    endDate,
    page = '1',
    limit = '20',
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId };
  if (status) where.status = status;
  if (technicianId) where.technicianId = technicianId;
  if (customerId) where.customerId = customerId;
  if (startDate || endDate) {
    where.scheduledStart = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  // Technicians only see their own assigned jobs (unless viewAllJobs is on)
  if (req.user!.role === 'technician') {
    const perms = await getTenantPermissions(req.user!.tenantId);
    if (!perms.technician.viewAllJobs) {
      where.OR = [
        { technicianId: req.user!.sub },
        { assignedTechnicians: { some: { userId: req.user!.sub } } },
      ];
    }
  }

  const techInclude = { select: { id: true, firstName: true, lastName: true, phone: true } };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        serviceAddress: true,
        technician: techInclude,
        assignedTechnicians: { include: { user: techInclude } },
        lineItems: true,
      },
      orderBy: { scheduledStart: 'asc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.job.count({ where }),
  ]);

  res.json({
    success: true,
    data: jobs,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// GET /api/v1/jobs/:id
jobsRouter.get('/:id', async (req, res) => {
  const techInclude2 = { select: { id: true, firstName: true, lastName: true, phone: true } };

  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      serviceAddress: true,
      technician: techInclude2,
      assignedTechnicians: { include: { user: techInclude2 } },
      lineItems: true,
      photos: true,
      notes: { include: { author: { select: { id: true, firstName: true, lastName: true } } } },
      recurrence: true,
    },
  });

  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  // Technician can only view their own job (unless viewAllJobs)
  if (req.user!.role === 'technician') {
    const perms = await getTenantPermissions(req.user!.tenantId);
    const isAssigned =
      job.technicianId === req.user!.sub ||
      job.assignedTechnicians.some((a) => a.userId === req.user!.sub);
    if (!perms.technician.viewAllJobs && !isAssigned) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }
  }

  res.json({ success: true, data: job } satisfies ApiResponse);
});

// POST /api/v1/jobs — technicians cannot create jobs; sales can only if createJobs is on
jobsRouter.post('/', async (req, res) => {
  if (req.user!.role === 'technician') {
    throw new AppError('Technicians cannot create jobs', 403, 'FORBIDDEN');
  }
  if (req.user!.role === 'sales') {
    const perms = await getTenantPermissions(req.user!.tenantId);
    if (!perms.sales.createJobs) {
      throw new AppError('Sales reps are not permitted to create jobs', 403, 'FORBIDDEN');
    }
  }

  const { lineItems, recurrence, technicianIds, ...jobData } = req.body;

  // technicianIds = full list; technicianId = lead tech (first in list or explicit)
  const allTechIds: string[] = technicianIds ?? (jobData.technicianId ? [jobData.technicianId] : []);
  if (allTechIds.length > 0 && !jobData.technicianId) {
    jobData.technicianId = allTechIds[0];
  }

  const job = await prisma.job.create({
    data: {
      ...jobData,
      tenantId: req.user!.tenantId,
      createdById: req.user!.sub,
      lineItems: lineItems ? { create: lineItems } : undefined,
      recurrence: recurrence ? { create: recurrence } : undefined,
      assignedTechnicians: allTechIds.length > 0
        ? { create: allTechIds.map((userId: string) => ({ userId })) }
        : undefined,
    },
    include: { lineItems: true, customer: true, serviceAddress: true, assignedTechnicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
  });

  io?.to(`tenant:${req.user!.tenantId}`).emit('job:created', job);

  res.status(201).json({ success: true, data: job } satisfies ApiResponse);
});

// PATCH /api/v1/jobs/:id
jobsRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  // Technicians can only update their own jobs, and only allowed fields
  if (req.user!.role === 'technician') {
    const isAssigned = existing.technicianId === req.user!.sub ||
      await prisma.jobTechnician.findUnique({ where: { jobId_userId: { jobId: req.params.id, userId: req.user!.sub } } }).then(Boolean);
    if (!isAssigned) {
      throw new AppError('You can only update your own assigned jobs', 403, 'FORBIDDEN');
    }
    // Restrict to status and time fields only
    const { status, actualStart, actualEnd } = req.body;
    const safeData: Record<string, unknown> = {};
    if (status !== undefined) safeData.status = status;
    if (actualStart !== undefined) safeData.actualStart = actualStart;
    if (actualEnd !== undefined) safeData.actualEnd = actualEnd;

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: safeData,
      include: { lineItems: true, customer: true, serviceAddress: true },
    });
    io?.to(`tenant:${req.user!.tenantId}`).emit('job:updated', job);
    return res.json({ success: true, data: job } satisfies ApiResponse);
  }

  // Sales reps cannot reassign or edit job details (read-only via GET, appointments via POST)
  if (req.user!.role === 'sales') {
    throw new AppError('Sales reps cannot modify existing jobs', 403, 'FORBIDDEN');
  }

  const { lineItems, technicianIds, ...jobData } = req.body;

  // Sync assignedTechnicians if technicianIds provided
  if (technicianIds !== undefined) {
    const allTechIds: string[] = technicianIds;
    jobData.technicianId = allTechIds[0] ?? null;
    await prisma.jobTechnician.deleteMany({ where: { jobId: req.params.id } });
    if (allTechIds.length > 0) {
      await prisma.jobTechnician.createMany({
        data: allTechIds.map((userId: string) => ({ jobId: req.params.id, userId })),
        skipDuplicates: true,
      });
    }
  }

  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: jobData,
    include: {
      lineItems: true,
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      serviceAddress: true,
      assignedTechnicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });

  io?.to(`tenant:${req.user!.tenantId}`).emit('job:updated', job);

  res.json({ success: true, data: job } satisfies ApiResponse);

  // On job completion: create review token + send request to customer
  if (jobData.status === 'completed') {
    setImmediate(async () => {
      try {
        const existing = await prisma.jobReview.findUnique({ where: { jobId: job.id } });
        if (existing) return;
        const review = await prisma.jobReview.create({
          data: {
            tenantId: req.user!.tenantId,
            jobId: job.id,
            customerId: job.customerId,
            technicianId: job.technicianId ?? undefined,
          },
        });
        const appUrl = process.env.WEB_URL ?? 'http://localhost:5173';
        const reviewUrl = `${appUrl}/review/${review.reviewToken}`;
        const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
        const customer = job.customer;
        if (!customer || !tenant) return;
        const techName = req.user!.role === 'technician'
          ? undefined
          : (await prisma.user.findUnique({ where: { id: job.technicianId ?? '' }, select: { firstName: true } }))?.firstName;
        if (customer.phone) {
          const body = `Hi ${customer.firstName}! How did we do? ${techName ? `${techName} just` : 'We'} completed your ${job.title} service. Please rate us: ${reviewUrl}`;
          await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
        }
        if (customer.email) {
          await sendJobReviewRequest({
            to: customer.email,
            customerName: `${customer.firstName} ${customer.lastName}`,
            jobTitle: job.title,
            technicianName: techName,
            reviewUrl,
            companyName: tenant.name,
          });
        }
      } catch { /* non-critical */ }
    });
  }
});

// POST /api/v1/jobs/:id/notes
jobsRouter.post('/:id/notes', async (req, res) => {
  const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  // Technician can only note their own job
  if (req.user!.role === 'technician' && existing.technicianId !== req.user!.sub) {
    throw new AppError('You can only add notes to your own jobs', 403, 'FORBIDDEN');
  }

  const note = await prisma.jobNote.create({
    data: {
      jobId: req.params.id,
      authorId: req.user!.sub,
      content: req.body.content,
      isInternal: req.body.isInternal ?? false,
    },
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  });

  res.status(201).json({ success: true, data: note } satisfies ApiResponse);
});
