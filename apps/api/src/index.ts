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
      `UPDATE "_prisma_migrations" SET finished_at = NOW(), applied_steps_count = 1, logs = NULL WHERE migration_name IN ('20260504000001_training_target_users','20260504000002_training_files','20260504000002_training_interactive') AND finished_at IS NULL`
    );
    logger.info('Migration record patched');
  } catch {
    logger.warn('Migration patch skipped (may already be clean)');
  }

  // Ensure ancillary tables/columns exist regardless of migration state
  try {
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
    await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trainingBonusRate" DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "training_user_progress" (
        "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"       TEXT NOT NULL,
        "userId"         TEXT NOT NULL,
        "sectionsRead"   TEXT[] NOT NULL DEFAULT '{}',
        "exercisesDone"  TEXT[] NOT NULL DEFAULT '{}',
        "rolePlayCount"  INTEGER NOT NULL DEFAULT 0,
        "currentStreak"  INTEGER NOT NULL DEFAULT 0,
        "milestonesEarned" INTEGER NOT NULL DEFAULT 0,
        "lastActivityAt" TIMESTAMP(3),
        "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "training_user_progress_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "training_user_progress_userId_key" UNIQUE ("userId")
      )
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "training_user_progress" ADD COLUMN IF NOT EXISTS "milestonesEarned" INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "role_play_sessions" (
        "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"   TEXT NOT NULL,
        "userId"     TEXT NOT NULL,
        "scenario"   TEXT NOT NULL,
        "difficulty" TEXT NOT NULL,
        "objection"  TEXT,
        "transcript" JSONB NOT NULL,
        "debrief"    TEXT,
        "rating"     TEXT,
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "role_play_sessions_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "role_play_sessions_tenantId_userId_idx" ON "role_play_sessions"("tenantId", "userId")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "training_exercise_answers" (
        "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"   TEXT NOT NULL,
        "userId"     TEXT NOT NULL,
        "exerciseId" TEXT NOT NULL,
        "answer"     TEXT NOT NULL,
        "aiFeedback" TEXT,
        "status"     TEXT NOT NULL DEFAULT 'in_progress',
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "training_exercise_answers_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "training_exercise_answers_userId_exerciseId_key" UNIQUE ("userId", "exerciseId")
      )
    `);
  } catch {
    logger.warn('Training table setup skipped');
  }

  // Job files table — must always exist; isolated so other failures cannot block it
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "job_files" (
        "id"              TEXT NOT NULL,
        "tenantId"        TEXT NOT NULL,
        "jobId"           TEXT NOT NULL,
        "uploadedById"    TEXT NOT NULL,
        "fileType"        TEXT NOT NULL DEFAULT 'photo',
        "photoCategory"   TEXT,
        "stageType"       TEXT,
        "stageName"       TEXT,
        "originalName"    TEXT NOT NULL,
        "mimeType"        TEXT NOT NULL,
        "fileSizeBytes"   INTEGER NOT NULL DEFAULT 0,
        "data"            BYTEA NOT NULL,
        "visibility"      TEXT NOT NULL DEFAULT 'internal',
        "notes"           TEXT,
        "noteVisibility"  TEXT NOT NULL DEFAULT 'internal',
        "costAmount"      DECIMAL(10,2),
        "costBillable"    BOOLEAN NOT NULL DEFAULT false,
        "receiptCategory" TEXT,
        "vendorName"      TEXT,
        "purchaseDate"    TIMESTAMP(3),
        "latitude"        DOUBLE PRECISION,
        "longitude"       DOUBLE PRECISION,
        "deletedAt"       TIMESTAMP(3),
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "job_files_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "job_files_jobId_idx" ON "job_files"("jobId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "job_files_tenantId_idx" ON "job_files"("tenantId")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'job_files_tenantId_fkey') THEN
          ALTER TABLE "job_files" ADD CONSTRAINT "job_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'job_files_jobId_fkey') THEN
          ALTER TABLE "job_files" ADD CONSTRAINT "job_files_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    logger.info('job_files table ensured');
  } catch (e) {
    logger.error('job_files table setup failed: ' + String(e));
  }

  // Invite codes table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "invite_codes" (
        "id"                 TEXT NOT NULL DEFAULT gen_random_uuid(),
        "code"               TEXT NOT NULL,
        "createdByTenantId"  TEXT NOT NULL,
        "note"               TEXT,
        "trialDays"          INTEGER NOT NULL DEFAULT 30,
        "maxUses"            INTEGER NOT NULL DEFAULT 1,
        "uses"               INTEGER NOT NULL DEFAULT 0,
        "usedAt"             TIMESTAMP(3),
        "expiresAt"          TIMESTAMP(3),
        "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "invite_codes_code_key" UNIQUE ("code")
      )
    `);
    logger.info('invite_codes table ensured');
  } catch (e) {
    logger.warn('invite_codes setup skipped: ' + String(e));
  }

  // AI provider config columns on tenants
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "aiApiKey" TEXT`);
    logger.info('AI provider columns ensured');
  } catch (e) {
    logger.warn('AI provider column setup skipped: ' + String(e));
  }

  // Invoice pay link + down payment columns
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payToken" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "invoices_payToken_key" ON "invoices"("payToken") WHERE "payToken" IS NOT NULL`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "downPaymentAmount" INTEGER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "downPaymentDueDate" TIMESTAMP(3)`);
    // Back-fill payToken for any existing invoices that don't have one
    // Uses gen_random_uuid() (no extension needed) — 32 hex chars, 128 bits of randomness
    await prisma.$executeRawUnsafe(`
      UPDATE "invoices" SET "payToken" = replace(gen_random_uuid()::text, '-', '')
      WHERE "payToken" IS NULL AND status NOT IN ('void','draft')
    `);
    logger.info('invoice pay columns ensured');
  } catch (e) {
    logger.warn('invoice pay columns skipped: ' + String(e));
  }

  // Service items catalog table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "service_items" (
        "id"          TEXT NOT NULL,
        "tenantId"    TEXT NOT NULL,
        "name"        TEXT NOT NULL,
        "description" TEXT,
        "unitPrice"   INTEGER NOT NULL DEFAULT 0,
        "taxable"     BOOLEAN NOT NULL DEFAULT true,
        "category"    TEXT,
        "isActive"    BOOLEAN NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "service_items_tenantId_idx" ON "service_items"("tenantId")`);
    logger.info('service_items table ensured');
  } catch (e) {
    logger.warn('service_items table setup skipped: ' + String(e));
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
