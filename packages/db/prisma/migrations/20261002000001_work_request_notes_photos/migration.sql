-- Tenant notes and photos on work requests.
-- Photos live in Postgres (like job_files) because there is no object storage.
-- Written by hand — see 20260921000001 for why `prisma migrate diff` is unsafe here.

CREATE TABLE IF NOT EXISTS "portal_request_photos" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "workRequestId" TEXT         NOT NULL,
  "portalUserId"  TEXT,
  "userId"        TEXT,
  "originalName"  TEXT         NOT NULL,
  "mimeType"      TEXT         NOT NULL,
  "size"          INTEGER      NOT NULL,
  "data"          BYTEA        NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_request_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "portal_request_photos_workRequestId_idx" ON "portal_request_photos"("workRequestId");

CREATE TABLE IF NOT EXISTS "portal_request_notes" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "workRequestId" TEXT         NOT NULL,
  "portalUserId"  TEXT,
  "userId"        TEXT,
  "body"          TEXT         NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_request_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "portal_request_notes_workRequestId_idx" ON "portal_request_notes"("workRequestId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_photos_workRequestId_fkey') THEN
    ALTER TABLE "portal_request_photos" ADD CONSTRAINT "portal_request_photos_workRequestId_fkey"
      FOREIGN KEY ("workRequestId") REFERENCES "portal_work_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_photos_portalUserId_fkey') THEN
    ALTER TABLE "portal_request_photos" ADD CONSTRAINT "portal_request_photos_portalUserId_fkey"
      FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_photos_userId_fkey') THEN
    ALTER TABLE "portal_request_photos" ADD CONSTRAINT "portal_request_photos_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_notes_workRequestId_fkey') THEN
    ALTER TABLE "portal_request_notes" ADD CONSTRAINT "portal_request_notes_workRequestId_fkey"
      FOREIGN KEY ("workRequestId") REFERENCES "portal_work_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_notes_portalUserId_fkey') THEN
    ALTER TABLE "portal_request_notes" ADD CONSTRAINT "portal_request_notes_portalUserId_fkey"
      FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_request_notes_userId_fkey') THEN
    ALTER TABLE "portal_request_notes" ADD CONSTRAINT "portal_request_notes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Test tenants: a portal login an operator uses to try the tenant experience.
-- Hidden from the Portal Users list and never billed.
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
