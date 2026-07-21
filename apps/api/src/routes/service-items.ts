import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const serviceItemsRouter = Router();
serviceItemsRouter.use(authenticate);

// GET /api/v1/service-items
serviceItemsRouter.get('/', async (req, res) => {
  const { search, category } = req.query as Record<string, string>;

  // Build parameterized query with sequential parameter indices
  const conditions: string[] = ['"tenantId" = $1', '"isActive" = true'];
  const params: unknown[] = [req.user!.tenantId];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(LOWER("name") LIKE LOWER($${params.length}) OR LOWER(COALESCE("description",'')) LIKE LOWER($${params.length}))`);
  }
  if (category) {
    params.push(category);
    conditions.push(`"category" = $${params.length}`);
  }

  const items = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "service_items" WHERE ${conditions.join(' AND ')} ORDER BY "name" ASC LIMIT 200`,
    ...params,
  );

  res.json({ success: true, data: items } satisfies ApiResponse);
});

// POST /api/v1/service-items
serviceItemsRouter.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { name, description, unitPrice, taxable = true, category } = req.body as {
    name: string; description?: string; unitPrice: number; taxable?: boolean; category?: string;
  };

  if (!name || unitPrice == null) {
    throw new AppError('name and unitPrice are required', 400, 'VALIDATION_ERROR');
  }

  const id = `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "service_items" ("id","tenantId","name","description","unitPrice","taxable","category","isActive","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())`,
    id, req.user!.tenantId, name, description ?? null,
    Math.round(unitPrice), taxable, category ?? null,
  );

  const [item] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "service_items" WHERE id = $1`, id,
  );

  res.status(201).json({ success: true, data: item } satisfies ApiResponse);
});

// PATCH /api/v1/service-items/:id
serviceItemsRouter.patch('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { name, description, unitPrice, taxable, category, isActive } = req.body as {
    name?: string; description?: string; unitPrice?: number;
    taxable?: boolean; category?: string; isActive?: boolean;
  };

  const [existing] = await prisma.$queryRawUnsafe<Array<{ id: string; tenantId: string }>>(
    `SELECT id, "tenantId" FROM "service_items" WHERE id = $1`, req.params.id,
  );
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Service item not found', 404, 'NOT_FOUND');
  }

  const sets: string[] = ['"updatedAt" = NOW()'];
  const params: unknown[] = [req.params.id];
  const push = (col: string, val: unknown) => { sets.push(`"${col}" = $${params.length + 1}`); params.push(val); };

  if (name !== undefined) push('name', name);
  if (description !== undefined) push('description', description);
  if (unitPrice !== undefined) push('unitPrice', Math.round(unitPrice));
  if (taxable !== undefined) push('taxable', taxable);
  if (category !== undefined) push('category', category);
  if (isActive !== undefined) push('isActive', isActive);

  await prisma.$executeRawUnsafe(`UPDATE "service_items" SET ${sets.join(',')} WHERE id = $1`, ...params);

  const [item] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "service_items" WHERE id = $1`, req.params.id,
  );

  res.json({ success: true, data: item } satisfies ApiResponse);
});

// DELETE /api/v1/service-items/:id  (soft delete)
serviceItemsRouter.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const [existing] = await prisma.$queryRawUnsafe<Array<{ id: string; tenantId: string }>>(
    `SELECT id, "tenantId" FROM "service_items" WHERE id = $1`, req.params.id,
  );
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Service item not found', 404, 'NOT_FOUND');
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "service_items" SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1`, req.params.id,
  );
  res.json({ success: true, data: { message: 'Deleted' } } satisfies ApiResponse);
});
