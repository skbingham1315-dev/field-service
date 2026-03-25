import 'dotenv/config';
import 'express-async-errors';
import http from 'http';
import { app } from './app';
import { initSocket } from './socket';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { prisma } from '@fsp/db';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  // Verify DB connection
  await prisma.$connect();
  logger.info('✅ PostgreSQL connected');

  // Verify Redis connection
  await redis.ping();
  logger.info('✅ Redis connected');

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`🚀 API server listening on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    httpServer.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});
