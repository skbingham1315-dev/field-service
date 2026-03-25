import { Router } from 'express';
import { prisma } from '@fsp/db';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errorHandler';
import { signAccessToken, signRefreshToken, verifyRefreshToken, buildTokenPayload } from '../lib/jwt';
import type { ApiResponse } from '@fsp/types';
import type { UserRole } from '@fsp/types';

export const authRouter = Router();

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password, tenantSlug } = req.body as {
    email: string;
    password: string;
    tenantSlug: string;
  };

  if (!email || !password || !tenantSlug) {
    throw new AppError('email, password, and tenantSlug are required', 400, 'VALIDATION_ERROR');
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  if (user.status !== 'active') {
    throw new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const payload = buildTokenPayload({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    email: user.email,
  });
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  // Store hashed refresh token
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: refreshHash } });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
    },
  } satisfies ApiResponse);
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) throw new AppError('refreshToken required', 400, 'VALIDATION_ERROR');

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.refreshTokenHash) throw new AppError('Session expired', 401, 'SESSION_EXPIRED');

  const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!valid) throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');

  const tokenPayload = buildTokenPayload({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    email: user.email,
  });
  const newAccessToken = signAccessToken(tokenPayload);

  res.json({ success: true, data: { accessToken: newAccessToken } } satisfies ApiResponse);
});

// POST /api/v1/auth/logout
authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.user.update({
        where: { id: payload.sub },
        data: { refreshTokenHash: null },
      });
    } catch {
      // ignore invalid token on logout
    }
  }
  res.json({ success: true, data: { message: 'Logged out' } } satisfies ApiResponse);
});
