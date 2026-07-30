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

  // Ensure category column exists on contacts (in case migration didn't run)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "category" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "contacts_tenantId_category_idx" ON "contacts"("tenantId", "category")`);
    logger.info('contacts.category column ensured');
  } catch (e) {
    logger.warn('contacts.category setup skipped: ' + String(e));
  }

  // Back-fill payToken for any existing invoices that don't have one
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "invoices" SET "payToken" = replace(gen_random_uuid()::text, '-', '')
      WHERE "payToken" IS NULL AND status NOT IN ('void','draft')
    `);
  } catch (e) {
    logger.warn('invoice payToken backfill skipped: ' + String(e));
  }

  // One-time: attach Square token for Blue Dingo tenant
  try {
    const bdOwner = await prisma.user.findFirst({
      where: { email: 'kadestephbingham@gmail.com', role: 'owner' },
      select: { tenantId: true },
    });
    if (bdOwner) {
      const t = await prisma.tenant.findUnique({ where: { id: bdOwner.tenantId }, select: { settings: true } });
      const s = (t?.settings ?? {}) as Record<string, unknown>;
      if (!s.squareAccessToken || (typeof s.squareAccessToken === 'string' && s.squareAccessToken.startsWith('sq0idp-'))) {
        s.squareAccessToken = 'EAAAl7x5zmzLnMcP2-7KXcZItiM96ETexVgASTpxj91CBgjJZwKPsCwWqjGCyLZo';
        await prisma.tenant.update({ where: { id: bdOwner.tenantId }, data: { settings: s as any } });
        logger.info('Square token attached for Blue Dingo tenant');
      }
    }
  } catch (e) {
    logger.warn('Square token attach skipped: ' + String(e));
  }

  // One-time: wipe all invoices/estimates/payments for Blue Dingo tenant (clean slate)
  try {
    // Find tenant by slug instead of email
    const bdTenant = await prisma.tenant.findFirst({
      where: { slug: { in: ['bluedingoconstruction', 'blue-dingo', 'bluedingo'] } },
      select: { id: true, settings: true },
    });
    if (bdTenant) {
      const s = (bdTenant.settings ?? {}) as Record<string, unknown>;
      if (!s._invoicesWiped) {
        const d1 = await prisma.invoiceLineItem.deleteMany({ where: { invoice: { tenantId: bdTenant.id } } });
        const d2 = await prisma.payment.deleteMany({ where: { tenantId: bdTenant.id } });
        const d3 = await prisma.invoice.deleteMany({ where: { tenantId: bdTenant.id } });
        s._invoicesWiped = true;
        await prisma.tenant.update({ where: { id: bdTenant.id }, data: { settings: s as any } });
        logger.info(`Invoice wipe complete: ${d3.count} invoices, ${d2.count} payments, ${d1.count} line items`);
      }
    } else {
      logger.warn('Invoice wipe: tenant not found by slug');
    }
  } catch (e) {
    logger.warn('Invoice wipe skipped: ' + String(e));
  }

  // One-time: categorize existing contacts as "Property Management" for Blue Dingo
  try {
    const bdTenant2 = await prisma.tenant.findFirst({
      where: { slug: { in: ['bluedingoconstruction', 'blue-dingo', 'bluedingo'] } },
      select: { id: true, settings: true },
    });
    if (bdTenant2) {
      const s2 = (bdTenant2.settings ?? {}) as Record<string, unknown>;
      if (!s2._contactsCategorized) {
        const uncategorized = await prisma.contact.count({ where: { tenantId: bdTenant2.id, category: null, isArchived: false } });
        if (uncategorized > 0) {
          await prisma.contact.updateMany({
            where: { tenantId: bdTenant2.id, category: null, isArchived: false },
            data: { category: 'Property Management' },
          });
          logger.info(`Categorized ${uncategorized} contacts as "Property Management"`);
        }
        s2._contactsCategorized = true;
        await prisma.tenant.update({ where: { id: bdTenant2.id }, data: { settings: s2 as any } });
      }
    } else {
      logger.warn('Contact categorization: tenant not found by slug');
    }
  } catch (e) {
    logger.warn('Contact categorization skipped: ' + String(e));
  }

  // One-time: sync Square catalog items for Blue Dingo
  try {
    const bdTenant3 = await prisma.tenant.findFirst({
      where: { slug: { in: ['bluedingoconstruction', 'blue-dingo', 'bluedingo'] } },
      select: { id: true, settings: true },
    });
    if (bdTenant3) {
      const s3 = (bdTenant3.settings ?? {}) as Record<string, unknown>;
      if (!s3._catalogSynced && typeof s3.squareAccessToken === 'string' && s3.squareAccessToken.startsWith('EAAA')) {
        const token = s3.squareAccessToken;
        const headers = { 'Square-Version': '2024-01-17', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const base = 'https://connect.squareup.com';
        // Fetch all items
        const allItems: Array<{ item_data?: { name?: string; description?: string; category_id?: string; variations?: Array<{ item_variation_data?: { pricing_type?: string; price_money?: { amount?: number } } }> } }> = [];
        let cursor: string | undefined;
        do {
          const url = cursor ? `${base}/v2/catalog/list?types=ITEM&cursor=${encodeURIComponent(cursor)}` : `${base}/v2/catalog/list?types=ITEM`;
          const res = await fetch(url, { headers });
          const data = await res.json() as { objects?: typeof allItems; cursor?: string };
          if (data.objects) allItems.push(...data.objects);
          cursor = data.cursor;
        } while (cursor);
        // Fetch categories
        const catMap = new Map<string, string>();
        let catCur: string | undefined;
        do {
          const url = catCur ? `${base}/v2/catalog/list?types=CATEGORY&cursor=${encodeURIComponent(catCur)}` : `${base}/v2/catalog/list?types=CATEGORY`;
          const res = await fetch(url, { headers });
          const data = await res.json() as { objects?: Array<{ id: string; category_data?: { name?: string } }>; cursor?: string };
          for (const c of data.objects ?? []) catMap.set(c.id, c.category_data?.name ?? 'Uncategorized');
          catCur = data.cursor;
        } while (catCur);
        let imported = 0;
        for (const item of allItems) {
          const name = item.item_data?.name;
          if (!name) continue;
          const v = item.item_data?.variations?.[0]?.item_variation_data;
          const unitPrice = v?.price_money?.amount ?? 0;
          if (v?.pricing_type === 'VARIABLE_PRICING' && unitPrice === 0) continue;
          const category = catMap.get(item.item_data?.category_id ?? '') ?? null;
          const description = item.item_data?.description ?? null;
          const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM service_items WHERE "tenantId" = $1 AND LOWER(name) = LOWER($2) AND "isActive" = true LIMIT 1`, bdTenant3.id, name);
          if (existing.length === 0) {
            const id = `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await prisma.$executeRawUnsafe(`INSERT INTO service_items (id, "tenantId", name, description, "unitPrice", taxable, category, "isActive") VALUES ($1, $2, $3, $4, $5, true, $6, true)`, id, bdTenant3.id, name, description, unitPrice, category);
            imported++;
          }
        }
        s3._catalogSynced = true;
        await prisma.tenant.update({ where: { id: bdTenant3.id }, data: { settings: s3 as any } });
        logger.info(`Square catalog synced: ${imported} items imported from ${allItems.length} total`);
      }
    }
  } catch (e) {
    logger.warn('Square catalog sync skipped: ' + String(e));
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
