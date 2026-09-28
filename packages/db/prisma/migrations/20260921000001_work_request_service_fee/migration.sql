-- Work-request service fee (home-warranty model) + portal users linked to rental tenants.
--
-- Written by hand rather than generated. `prisma migrate diff` against this database
-- also proposes dropping invite_codes, service_items, tenants.aiProvider/aiApiKey and
-- review_responses.tenantId — those objects are created at runtime by raw SQL in
-- apps/api/src/index.ts and have never been added to schema.prisma. Only the additive
-- changes below are intended here.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkRequestResponsibility" AS ENUM ('undetermined', 'landlord', 'tenant', 'no_fault_found');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkRequestFeeStatus" AS ENUM ('not_applicable', 'disclosed', 'waived', 'assessed', 'invoiced', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: portal_configs — per-client fee policy
ALTER TABLE "portal_configs"
  ADD COLUMN IF NOT EXISTS "serviceFeeEnabled"        BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "serviceFeeAmount"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "serviceFeeDisclosure"     TEXT,
  ADD COLUMN IF NOT EXISTS "serviceFeeWaiveEmergency" BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "serviceFeeWaiveLandlord"  BOOLEAN       NOT NULL DEFAULT true;

-- AlterTable: portal_users — link a portal login to a rental tenant
ALTER TABLE "portal_users"
  ADD COLUMN IF NOT EXISTS "pmTenantId" TEXT;

-- AlterTable: portal_work_requests — fee lifecycle + property link
ALTER TABLE "portal_work_requests"
  ADD COLUMN IF NOT EXISTS "propertyId"        TEXT,
  ADD COLUMN IF NOT EXISTS "feeStatus"         "WorkRequestFeeStatus"      NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS "feeAmount"         DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "feeAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "responsibility"    "WorkRequestResponsibility" NOT NULL DEFAULT 'undetermined',
  ADD COLUMN IF NOT EXISTS "feeDecidedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "feeDecidedById"    TEXT,
  ADD COLUMN IF NOT EXISTS "feeDecisionNote"   TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "portal_users_pmTenantId_idx" ON "portal_users"("pmTenantId");
CREATE INDEX IF NOT EXISTS "portal_work_requests_propertyId_idx" ON "portal_work_requests"("propertyId");
CREATE INDEX IF NOT EXISTS "portal_work_requests_tenantId_feeStatus_idx" ON "portal_work_requests"("tenantId", "feeStatus");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_users_pmTenantId_fkey') THEN
    ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_pmTenantId_fkey"
      FOREIGN KEY ("pmTenantId") REFERENCES "pm_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_work_requests_propertyId_fkey') THEN
    ALTER TABLE "portal_work_requests" ADD CONSTRAINT "portal_work_requests_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_work_requests_feeDecidedById_fkey') THEN
    ALTER TABLE "portal_work_requests" ADD CONSTRAINT "portal_work_requests_feeDecidedById_fkey"
      FOREIGN KEY ("feeDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
