-- CreateEnum
CREATE TYPE "ConnectPlan" AS ENUM ('none', 'starter', 'growth', 'pro', 'enterprise');

-- CreateTable
CREATE TABLE "portal_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectPlan" "ConnectPlan" NOT NULL DEFAULT 'none',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalName" TEXT NOT NULL DEFAULT 'Customer Portal',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "customDomain" TEXT,
    "enableBilling" BOOLEAN NOT NULL DEFAULT true,
    "enableWorkRequests" BOOLEAN NOT NULL DEFAULT true,
    "enableMessaging" BOOLEAN NOT NULL DEFAULT true,
    "enableDocuments" BOOLEAN NOT NULL DEFAULT false,
    "allowMagicLink" BOOLEAN NOT NULL DEFAULT true,
    "allowSmsOtp" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnJobUpdate" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnInvoice" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnMessage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "otp" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_work_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "crmJobId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceAddress" TEXT,
    "category" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "photoUrls" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_work_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "fromPortal" BOOLEAN NOT NULL DEFAULT true,
    "senderName" TEXT,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_configs_tenantId_key" ON "portal_configs"("tenantId");

-- CreateIndex
CREATE INDEX "portal_users_tenantId_idx" ON "portal_users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_tenantId_email_key" ON "portal_users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_token_key" ON "portal_sessions"("token");

-- CreateIndex
CREATE INDEX "portal_sessions_portalUserId_idx" ON "portal_sessions"("portalUserId");

-- CreateIndex
CREATE INDEX "portal_sessions_token_idx" ON "portal_sessions"("token");

-- CreateIndex
CREATE INDEX "portal_work_requests_tenantId_status_idx" ON "portal_work_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "portal_work_requests_portalUserId_idx" ON "portal_work_requests"("portalUserId");

-- CreateIndex
CREATE INDEX "portal_messages_tenantId_portalUserId_idx" ON "portal_messages"("tenantId", "portalUserId");

-- AddForeignKey
ALTER TABLE "portal_configs" ADD CONSTRAINT "portal_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_work_requests" ADD CONSTRAINT "portal_work_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_work_requests" ADD CONSTRAINT "portal_work_requests_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
