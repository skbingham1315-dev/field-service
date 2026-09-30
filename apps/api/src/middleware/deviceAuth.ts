import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '@fsp/db';
import { AppError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      device?: { id: string; tenantId: string };
    }
  }
}

export function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken(): string {
  return `pbd_${crypto.randomBytes(32).toString('hex')}`;
}

export async function authenticateDevice(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer pbd_')) {
    throw new AppError('Invalid device token', 401, 'DEVICE_UNAUTHORIZED');
  }
  const token = header.slice(7);
  const tokenHash = hashDeviceToken(token);

  const device = await prisma.phoneBridgeDevice.findUnique({
    where: { tokenHash },
    select: { id: true, tenantId: true, isActive: true },
  });

  if (!device || !device.isActive) {
    throw new AppError('Device not registered or revoked', 401, 'DEVICE_REVOKED');
  }

  // Update last seen (fire and forget)
  prisma.phoneBridgeDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  req.device = { id: device.id, tenantId: device.tenantId };
  next();
}
