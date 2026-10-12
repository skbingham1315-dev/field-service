-- Typed sign-in codes: count wrong attempts so a code burns after 5 misses.
-- Emails are now matched case-insensitively; store them lower-case.
-- Written by hand — see 20260921000001 for why `prisma migrate diff` is unsafe here.

ALTER TABLE "portal_sessions" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
