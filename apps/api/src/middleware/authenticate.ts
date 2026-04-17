import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import type { AuthTokenPayload, UserRole } from '@fsp/types';
import { AppError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw new AppError('Invalid or expired token', 401, 'TOKEN_INVALID');
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const allRoles = [req.user.role, ...(req.user.secondaryRoles ?? [])] as UserRole[];
    if (!allRoles.some(r => roles.includes(r))) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    next();
  };
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    throw new AppError('Tenant context missing', 400, 'NO_TENANT');
  }
  next();
}
