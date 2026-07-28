-- Add missing invoice columns (previously managed via raw SQL at startup)
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payToken" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "downPaymentAmount" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "downPaymentDueDate" TIMESTAMP(3);

-- Create unique index on payToken (partial — only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_payToken_key" ON "invoices"("payToken");

-- Add tenant relation index to payments table
CREATE INDEX IF NOT EXISTS "payments_tenantId_idx" ON "payments"("tenantId");

-- Add foreign key from payments to tenants (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_tenantId_fkey'
    AND table_name = 'payments'
  ) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
