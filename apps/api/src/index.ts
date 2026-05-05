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
  // Fix any failed migration record so prisma migrate deploy can proceed
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET finished_at = NOW(), applied_steps_count = 1, logs = NULL WHERE migration_name IN ('20260504000001_training_target_users','20260504000002_training_files') AND finished_at IS NULL`
    );
    // Ensure training_files table exists (migration may not have run via deploy)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "training_files" (
        "id"        TEXT NOT NULL,
        "tenantId"  TEXT NOT NULL,
        "filename"  TEXT NOT NULL,
        "mimeType"  TEXT NOT NULL,
        "size"      INTEGER NOT NULL,
        "data"      BYTEA NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "training_files_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "training_files_tenantId_idx" ON "training_files"("tenantId")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'training_files_tenantId_fkey'
        ) THEN
          ALTER TABLE "training_files"
            ADD CONSTRAINT "training_files_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    logger.info('Migration record patched');
  } catch (e) {
    logger.warn('Migration patch skipped (may already be clean)');
  }

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
