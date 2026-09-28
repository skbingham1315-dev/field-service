-- Keep a verbatim copy of the fee terms each tenant accepted, so a later change to
-- the client's disclosure text never rewrites what an earlier tenant agreed to.
-- Written by hand — see 20260921000001 for why `prisma migrate diff` is unsafe here.

ALTER TABLE "portal_work_requests"
  ADD COLUMN IF NOT EXISTS "feeDisclosureSnapshot" TEXT;
