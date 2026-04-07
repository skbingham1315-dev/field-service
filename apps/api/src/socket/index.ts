import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '@fsp/db';
import { logger } from '../lib/logger';

export let io: SocketServer;

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.WEB_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.debug(`Socket connected: ${user.sub} (${user.role})`);

    // Join tenant room so we can broadcast to all tenant users
    socket.join(`tenant:${user.tenantId}`);

    // Technicians join their own room for direct messages
    if (user.role === 'technician') {
      socket.join(`tech:${user.sub}`);
    }

    // Technician broadcasts their GPS location
    socket.on('technician:location', async (data: { lat: number; lng: number; heading?: number; speed?: number }) => {
      // Persist to DB
      try {
        await Promise.all([
          prisma.technicianLocation.create({
            data: {
              technicianId: user.sub,
              lat: data.lat,
              lng: data.lng,
              heading: data.heading,
              speed: data.speed,
            },
          }),
          prisma.user.update({
            where: { id: user.sub },
            data: { lastLat: data.lat, lastLng: data.lng, lastLocationAt: new Date() },
          }),
        ]);
      } catch {
        // non-critical
      }

      // Broadcast to dispatchers
      socket.to(`tenant:${user.tenantId}`).emit('technician:location_updated', {
        technicianId: user.sub,
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    // Technician updates their availability
    socket.on('technician:availability', (data: { isAvailable: boolean }) => {
      socket.to(`tenant:${user.tenantId}`).emit('technician:availability_updated', {
        technicianId: user.sub,
        isAvailable: data.isAvailable,
      });
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${user.sub}`);
    });
  });

  logger.info('✅ Socket.io initialized');
  return io;
}
