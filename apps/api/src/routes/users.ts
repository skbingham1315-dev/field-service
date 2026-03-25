import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const usersRouter = Router();

usersRouter.use(authenticate);

// GET /api/v1/users
usersRouter.get('/', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const { role } = req.query as { role?: string };
  const users = await prisma.user.findMany({
    where: { tenantId: req.user!.tenantId, ...(role ? { role: role as never } : {}) },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      avatarUrl: true,
      isAvailable: true,
      skills: true,
      createdAt: true,
    },
    orderBy: { firstName: 'asc' },
  });
  res.json({ success: true, data: users } satisfies ApiResponse);
});

// GET /api/v1/users/me
usersRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.sub },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      avatarUrl: true,
      timezone: true,
      skills: true,
      isAvailable: true,
    },
  });
  res.json({ success: true, data: user } satisfies ApiResponse);
});

// PATCH /api/v1/users/me
usersRouter.patch('/me', async (req, res) => {
  const { firstName, lastName, phone, timezone, isAvailable } = req.body as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    timezone?: string;
    isAvailable?: boolean;
  };

  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { firstName, lastName, phone, timezone, isAvailable },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      phone: true, role: true, status: true, isAvailable: true,
    },
  });
  res.json({ success: true, data: user } satisfies ApiResponse);
});

// POST /api/v1/users/invite — owner/admin only
usersRouter.post('/invite', requireRole('owner', 'admin'), async (req, res) => {
  const { email, firstName, lastName, role, phone } = req.body as {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    phone?: string;
  };

  const validRoles = ['admin', 'dispatcher', 'technician', 'sales'];
  if (!validRoles.includes(role)) {
    throw new AppError(
      `role must be one of: ${validRoles.join(', ')}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  // Check email is not already used within this tenant
  const existing = await prisma.user.findFirst({
    where: { tenantId: req.user!.tenantId, email },
  });
  if (existing) {
    throw new AppError('A user with that email already exists in this tenant', 409, 'CONFLICT');
  }

  const inviteToken = crypto.randomUUID();
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      tenantId: req.user!.tenantId,
      email,
      firstName,
      lastName,
      phone,
      role: role as never,
      status: 'invited',
      passwordHash: '',
      inviteToken,
      inviteExpiresAt,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  // In dev, return the invite token directly so admin can share the link manually
  res.status(201).json({ success: true, data: { user, inviteToken } } satisfies ApiResponse);
});

// PATCH /api/v1/users/:userId — owner/admin only
usersRouter.patch('/:userId', requireRole('owner', 'admin'), async (req, res) => {
  const { userId } = req.params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== req.user!.tenantId) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const { role, status, firstName, lastName, phone } = req.body as {
    role?: string;
    status?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };

  // Owner cannot change their own role
  if (role && userId === req.user!.sub && req.user!.role === 'owner') {
    throw new AppError('Owner cannot change their own role', 403, 'FORBIDDEN');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(role ? { role: role as never } : {}),
      ...(status ? { status: status as never } : {}),
      firstName,
      lastName,
      phone,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: user } satisfies ApiResponse);
});

// DELETE /api/v1/users/:userId — owner/admin only (soft deactivate)
usersRouter.delete('/:userId', requireRole('owner', 'admin'), async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user!.sub) {
    throw new AppError('Cannot deactivate yourself', 400, 'VALIDATION_ERROR');
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== req.user!.tenantId) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'inactive' },
  });

  res.json({ success: true, data: { message: 'User deactivated' } } satisfies ApiResponse);
});
