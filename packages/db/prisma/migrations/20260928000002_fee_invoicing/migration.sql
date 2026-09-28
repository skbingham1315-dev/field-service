-- Invoice the work-request service fee and collect it through a Square payment link.
-- Written by hand — see 20260921000001 for why `prisma migrate diff` is unsafe here.

ALTER TABLE "portal_work_requests"
  ADD COLUMN IF NOT EXISTS "feeInvoiceId" TEXT;

CREATE INDEX IF NOT EXISTS "portal_work_requests_feeInvoiceId_idx" ON "portal_work_requests"("feeInvoiceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'portal_work_requests_feeInvoiceId_fkey') THEN
    ALTER TABLE "portal_work_requests" ADD CONSTRAINT "portal_work_requests_feeInvoiceId_fkey"
      FOREIGN KEY ("feeInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "squarePaymentLinkId" TEXT,
  ADD COLUMN IF NOT EXISTS "squarePaymentUrl"    TEXT,
  ADD COLUMN IF NOT EXISTS "squareOrderId"       TEXT;
