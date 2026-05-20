import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import crypto from 'crypto';
import type { ApiResponse } from '@fsp/types';

export const inviteCodesRouter = Router();
inviteCodesRouter.use(authenticate);
inviteCodesRouter.use(requireRole('owner'));

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// GET /api/v1/invite-codes
inviteCodesRouter.get('/', async (req, res) => {
  const codes = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM invite_codes WHERE "createdByTenantId" = $1 ORDER BY "createdAt" DESC`,
    req.user!.tenantId
  );
  res.json({ success: true, data: codes } satisfies ApiResponse);
});

// POST /api/v1/invite-codes
inviteCodesRouter.post('/', async (req, res) => {
  const { note, trialDays = 30, maxUses = 1, expiresAt } = req.body as {
    note?: string;
    trialDays?: number;
    maxUses?: number;
    expiresAt?: string;
  };

  // Generate a unique code (retry on collision)
  let code = generateCode();
  for (let i = 0; i < 10; i++) {
    const existing = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT id FROM invite_codes WHERE code = $1`, code
    );
    if (!existing.length) break;
    code = generateCode();
  }

  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO invite_codes (id, code, "createdByTenantId", note, "trialDays", "maxUses", "expiresAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    id, code, req.user!.tenantId,
    note ?? null, trialDays, maxUses,
    expiresAt ? new Date(expiresAt) : null
  );

  const [created] = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM invite_codes WHERE id = $1`, id
  );

  res.status(201).json({ success: true, data: created } satisfies ApiResponse);
});

// DELETE /api/v1/invite-codes/:id
inviteCodesRouter.delete('/:id', async (req, res) => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM invite_codes WHERE id = $1 AND "createdByTenantId" = $2`,
    req.params.id, req.user!.tenantId
  );
  res.json({ success: true, data: { message: 'Code revoked' } } satisfies ApiResponse);
});

// POST /api/v1/invite-codes/validate — public, called during signup
inviteCodesRouter.post('/validate', async (_req, res, next) => {
  // Remove auth for this one endpoint by short-circuiting after router middleware
  // Instead, handled directly in auth.ts register — this endpoint is just for UI pre-check
  next();
});
