CREATE TABLE IF NOT EXISTS "training_files" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "filename"  TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "data"      BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_files_tenantId_idx" ON "training_files"("tenantId");

ALTER TABLE "training_files"
  ADD CONSTRAINT "training_files_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
