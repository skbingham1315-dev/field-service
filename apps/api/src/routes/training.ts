import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const trainingRouter = Router();
trainingRouter.use(authenticate);

// GET /api/v1/training — list resources (filtered by audience for non-owners)
trainingRouter.get('/', async (req, res) => {
  const { tenantId, role } = req.user!;

  const where: Record<string, unknown> = { tenantId };
  if (role === 'technician') where.audience = { in: ['all', 'technician'] };
  else if (role === 'sales') where.audience = { in: ['all', 'sales'] };

  const resources = await prisma.trainingResource.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  });

  res.json({ success: true, data: resources } satisfies ApiResponse);
});

// POST /api/v1/training — create resource (owner/admin only)
trainingRouter.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { tenantId, sub } = req.user!;
  const { title, description, audience, fileUrl, fileType, content } = req.body as {
    title: string;
    description?: string;
    audience?: string;
    fileUrl?: string;
    fileType?: string;
    content?: string;
  };

  if (!title) throw new AppError('title is required', 400, 'VALIDATION_ERROR');

  const resource = await prisma.trainingResource.create({
    data: {
      tenantId,
      title,
      description: description || null,
      audience: audience ?? 'all',
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      content: content || null,
      createdById: sub,
    },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  });

  res.status(201).json({ success: true, data: resource } satisfies ApiResponse);
});

// PATCH /api/v1/training/:id — update (owner/admin only)
trainingRouter.patch('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { tenantId } = req.user!;
  const resource = await prisma.trainingResource.findUnique({ where: { id: req.params.id } });
  if (!resource || resource.tenantId !== tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');

  const { title, description, audience, fileUrl, fileType, content } = req.body;
  const updated = await prisma.trainingResource.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(audience !== undefined && { audience }),
      ...(fileUrl !== undefined && { fileUrl: fileUrl || null }),
      ...(fileType !== undefined && { fileType: fileType || null }),
      ...(content !== undefined && { content: content || null }),
    },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// DELETE /api/v1/training/:id
trainingRouter.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { tenantId } = req.user!;
  const resource = await prisma.trainingResource.findUnique({ where: { id: req.params.id } });
  if (!resource || resource.tenantId !== tenantId) throw new AppError('Not found', 404, 'NOT_FOUND');
  await prisma.trainingResource.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { message: 'Deleted' } } satisfies ApiResponse);
});
