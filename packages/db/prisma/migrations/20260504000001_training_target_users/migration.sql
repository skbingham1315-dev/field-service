-- Add targetUserIds column to training_resources (idempotent)
ALTER TABLE "training_resources" ADD COLUMN IF NOT EXISTS "targetUserIds" TEXT[] NOT NULL DEFAULT '{}';
