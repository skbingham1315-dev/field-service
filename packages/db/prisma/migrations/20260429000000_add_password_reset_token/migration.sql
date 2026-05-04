-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordResetToken" TEXT,
ADD COLUMN "passwordResetExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");
