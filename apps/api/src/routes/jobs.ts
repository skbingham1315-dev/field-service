import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../socket';
import type { ApiResponse } from '@fsp/types';
import { DEFAULT_ROLE_PERMISSIONS } from './tenants';
import { sendSms } from '../lib/sms';
import { sendJobReviewRequest } from '../lib/email';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const aiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

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

  // Technicians see all company jobs — they need to see today's work even if not yet assigned
  // (no assignment filter applied; viewAllJobs permission no longer restricts the list)

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

// POST /api/v1/jobs/ai-parse — any authenticated user; accepts image or PDF, returns extracted job info
jobsRouter.post('/ai-parse', aiUpload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400, 'BAD_REQUEST');

  const base64 = req.file.buffer.toString('base64');
  const isImage = req.file.mimetype.startsWith('image/');
  const isPdf = req.file.mimetype === 'application/pdf';

  const fileContent: Anthropic.MessageParam['content'] = isImage
    ? [
        { type: 'text', text: 'Extract job information from this image.' },
        { type: 'image', source: { type: 'base64', media_type: req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
      ]
    : isPdf
    ? [
        { type: 'text', text: 'Extract job information from this document.' },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
      ]
    : [{ type: 'text', text: 'No readable file provided.' }];

  const systemPrompt = `You are a field service dispatcher assistant. Extract job information from the provided file and return ONLY a valid JSON object with these fields (omit any you cannot determine):
{
  "title": "brief job title (max 80 chars)",
  "description": "detailed description of the work needed",
  "serviceType": "pool|pest_control|turf|handyman",
  "priority": "low|normal|high|urgent",
  "customerName": "full customer name if visible",
  "street": "service address street",
  "city": "city name",
  "state": "2-letter US state code",
  "zip": "zip code",
  "scheduledDate": "YYYY-MM-DD if a specific date is mentioned",
  "scheduledTime": "HH:MM in 24h format if a time is mentioned"
}
Return ONLY the raw JSON object, no markdown, no explanation.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: fileContent }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';
  let extracted: Record<string, string> = {};
  try {
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    extracted = JSON.parse(jsonStr);
  } catch {
    extracted = {};
  }

  res.json({ success: true, data: extracted } satisfies ApiResponse);
});

// POST /api/v1/jobs — techs can create jobs; sales can only if createJobs permission is on
jobsRouter.post('/', async (req, res) => {
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

// POST /api/v1/jobs/:id/self-assign — any tech can add themselves to a job
jobsRouter.post('/:id/self-assign', async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: { assignedTechnicians: true },
  });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }
  if (['completed', 'cancelled'].includes(job.status)) {
    throw new AppError('Cannot assign to a completed or cancelled job', 400, 'BAD_REQUEST');
  }

  const userId = req.user!.sub;
  const alreadyAssigned = job.technicianId === userId ||
    job.assignedTechnicians.some(t => t.userId === userId);

  if (!alreadyAssigned) {
    // Upsert into assignedTechnicians
    await prisma.jobTechnician.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: { jobId: job.id, userId },
      update: {},
    });
    // If no lead tech yet, make this tech the lead
    if (!job.technicianId) {
      await prisma.job.update({ where: { id: job.id }, data: { technicianId: userId } });
    }
  }

  const updated = await prisma.job.findUnique({
    where: { id: job.id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      serviceAddress: true,
      technician: { select: { id: true, firstName: true, lastName: true } },
      assignedTechnicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      lineItems: true,
      notes: { include: { author: { select: { firstName: true, lastName: true } } } },
    },
  });

  io?.to(`tenant:${req.user!.tenantId}`).emit('job:updated', updated);
  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// DELETE /api/v1/jobs/:id
jobsRouter.delete('/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }
  if (req.user!.role === 'technician' || req.user!.role === 'sales') {
    throw new AppError('Not authorized to delete jobs', 403, 'FORBIDDEN');
  }
  await prisma.job.delete({ where: { id: req.params.id } });
  io?.to(`tenant:${req.user!.tenantId}`).emit('job:deleted', { id: req.params.id });
  res.json({ success: true, data: { message: 'Job deleted' } } satisfies ApiResponse);
});
