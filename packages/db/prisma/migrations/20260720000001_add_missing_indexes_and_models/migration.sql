-- Add missing indexes for tenant-scoped performance
-- These are additive only — no data modifications

-- Payment model: add tenantId index for payment reports
CREATE INDEX IF NOT EXISTS "payments_tenantId_idx" ON "payments"("tenantId");
CREATE INDEX IF NOT EXISTS "payments_tenantId_createdAt_idx" ON "payments"("tenantId", "paidAt");

-- Customer status index for filtered queries
CREATE INDEX IF NOT EXISTS "customers_tenantId_status_idx" ON "customers"("tenantId", "status");

-- TrainingUserProgress: add tenantId index
CREATE INDEX IF NOT EXISTS "training_user_progress_tenantId_idx" ON "training_user_progress"("tenantId");

-- Add tenantId to review_responses for direct tenant queries (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_responses') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'review_responses' AND column_name = 'tenantId') THEN
      ALTER TABLE "review_responses" ADD COLUMN "tenantId" TEXT;
      -- Backfill from parent job_reviews
      UPDATE "review_responses" r SET "tenantId" = jr."tenantId"
      FROM "job_reviews" jr WHERE r."reviewId" = jr.id;
      CREATE INDEX IF NOT EXISTS "review_responses_tenantId_idx" ON "review_responses"("tenantId");
    END IF;
  END IF;
END $$;
