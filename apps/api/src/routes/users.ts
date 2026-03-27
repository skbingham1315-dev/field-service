import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
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
      payRate: true,
      payType: true,
      customPermissions: true,
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

// POST /api/v1/users — owner/admin: directly create a team member with password
usersRouter.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { email, firstName, lastName, role, phone, password, payRate, payType, customPermissions } = req.body as {
    email: string; firstName: string; lastName: string; role: string;
    phone?: string; password: string;
    payRate?: number; payType?: string; customPermissions?: Record<string, unknown>;
  };

  const validRoles = ['admin', 'dispatcher', 'technician', 'sales'];
  if (!email || !firstName || !lastName || !validRoles.includes(role)) {
    throw new AppError('email, firstName, lastName, and valid role are required', 400, 'VALIDATION_ERROR');
  }
  if (!password || password.length < 8) {
    throw new AppError('password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  const existing = await prisma.user.findFirst({ where: { tenantId: req.user!.tenantId, email } });
  if (existing) throw new AppError('A user with that email already exists', 409, 'CONFLICT');

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      tenantId: req.user!.tenantId,
      email, firstName, lastName,
      phone: phone || null,
      role: role as never,
      status: 'active',
      passwordHash,
      payRate: payRate ?? null,
      payType: payType ?? 'hourly',
      customPermissions: customPermissions ?? undefined,
    },
    select: {
      id: true, email: true, firstName: true, lastName: true, phone: true,
      role: true, status: true, payRate: true, payType: true, customPermissions: true, createdAt: true,
    },
  });

  res.status(201).json({ success: true, data: user } satisfies ApiResponse);
});

// POST /api/v1/users/invite — owner/admin only
usersRouter.post('/invite', requireRole('owner', 'admin'), async (req, res) => {
  const { email, firstName, lastName, role, phone, payRate, payType } = req.body as {
    email: string; firstName: string; lastName: string; role: string;
    phone?: string; payRate?: number; payType?: string;
  };

  const validRoles = ['admin', 'dispatcher', 'technician', 'sales'];
  if (!validRoles.includes(role)) {
    throw new AppError(`role must be one of: ${validRoles.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  const existing = await prisma.user.findFirst({ where: { tenantId: req.user!.tenantId, email } });
  if (existing) throw new AppError('A user with that email already exists in this tenant', 409, 'CONFLICT');

  const inviteToken = crypto.randomUUID();
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      tenantId: req.user!.tenantId,
      email, firstName, lastName, phone,
      role: role as never,
      status: 'invited',
      passwordHash: '',
      inviteToken,
      inviteExpiresAt,
      payRate: payRate ?? null,
      payType: payType ?? 'hourly',
    },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true, createdAt: true },
  });

  res.status(201).json({ success: true, data: { user, inviteToken } } satisfies ApiResponse);
});

// PATCH /api/v1/users/:userId — owner/admin only
usersRouter.patch('/:userId', requireRole('owner', 'admin'), async (req, res) => {
  const { userId } = req.params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== req.user!.tenantId) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const { role, status, firstName, lastName, phone, payRate, payType, customPermissions } = req.body as {
    role?: string; status?: string; firstName?: string; lastName?: string; phone?: string;
    payRate?: number | null; payType?: string; customPermissions?: Record<string, unknown> | null;
  };

  if (role && userId === req.user!.sub && req.user!.role === 'owner') {
    throw new AppError('Owner cannot change their own role', 403, 'FORBIDDEN');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(role ? { role: role as never } : {}),
      ...(status ? { status: status as never } : {}),
      firstName, lastName, phone,
      ...(payRate !== undefined ? { payRate } : {}),
      ...(payType !== undefined ? { payType } : {}),
      ...(customPermissions !== undefined ? { customPermissions } : {}),
    },
    select: {
      id: true, email: true, firstName: true, lastName: true, phone: true,
      role: true, status: true, payRate: true, payType: true, customPermissions: true, updatedAt: true,
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

// POST /api/v1/users/me/location — tech/sales update their GPS position
usersRouter.post('/me/location', async (req, res) => {
  const { lat, lng, heading, speed } = req.body as { lat: number; lng: number; heading?: number; speed?: number };
  const { sub: userId, tenantId } = req.user!;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ success: false, message: 'lat and lng required' });
    return;
  }

  await Promise.all([
    prisma.technicianLocation.create({ data: { technicianId: userId, lat, lng, heading: heading ?? null, speed: speed ?? null } }),
    prisma.user.update({ where: { id: userId }, data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() } }),
  ]);

  res.json({ success: true, data: { lat, lng } });
});

// GET /api/v1/users/locations — get current positions of all active field staff
usersRouter.get('/locations', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      tenantId: req.user!.tenantId,
      role: { in: ['technician', 'sales'] },
      status: 'active',
      lastLat: { not: null },
    },
    select: { id: true, firstName: true, lastName: true, role: true, lastLat: true, lastLng: true, lastLocationAt: true, isAvailable: true },
  });
  res.json({ success: true, data: users });
});
