-- Add targetUserIds column to training_resources
ALTER TABLE "training_resources" ADD COLUMN "targetUserIds" TEXT[] NOT NULL DEFAULT '{}';
