-- Occupants: people who live at a unit without being named on the lease.
--
-- Lease.pmTenantId remains the leaseholder (the one legally on the hook).
-- Everyone else in the household is an occupant. They get a portal login and can
-- report issues; they just aren't party to the lease.
--
-- Written by hand — see 20260921000001 for why `prisma migrate diff` is unsafe here.

CREATE TABLE IF NOT EXISTS "lease_occupants" (
  "id"           TEXT         NOT NULL,
  "leaseId"      TEXT         NOT NULL,
  "pmTenantId"   TEXT         NOT NULL,
  "relationship" TEXT,
  "notes"        TEXT,
  "addedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt"    TIMESTAMP(3),
  CONSTRAINT "lease_occupants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lease_occupants_leaseId_pmTenantId_key"
  ON "lease_occupants"("leaseId", "pmTenantId");
CREATE INDEX IF NOT EXISTS "lease_occupants_leaseId_idx"    ON "lease_occupants"("leaseId");
CREATE INDEX IF NOT EXISTS "lease_occupants_pmTenantId_idx" ON "lease_occupants"("pmTenantId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'lease_occupants_leaseId_fkey') THEN
    ALTER TABLE "lease_occupants" ADD CONSTRAINT "lease_occupants_leaseId_fkey"
      FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'lease_occupants_pmTenantId_fkey') THEN
    ALTER TABLE "lease_occupants" ADD CONSTRAINT "lease_occupants_pmTenantId_fkey"
      FOREIGN KEY ("pmTenantId") REFERENCES "pm_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
