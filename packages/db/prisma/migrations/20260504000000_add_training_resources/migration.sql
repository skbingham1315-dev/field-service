CREATE TABLE "training_resources" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "audience"    TEXT NOT NULL DEFAULT 'all',
  "fileUrl"     TEXT,
  "fileType"    TEXT,
  "content"     TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "training_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_resources_tenantId_audience_idx" ON "training_resources"("tenantId", "audience");

ALTER TABLE "training_resources" ADD CONSTRAINT "training_resources_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_resources" ADD CONSTRAINT "training_resources_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
