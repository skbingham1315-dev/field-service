-- Add category column to contacts for tab/group organization
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "category" TEXT;
CREATE INDEX IF NOT EXISTS "contacts_tenantId_category_idx" ON "contacts"("tenantId", "category");
