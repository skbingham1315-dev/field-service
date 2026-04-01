-- AlterTable
ALTER TABLE "crm_jobs" ADD COLUMN     "commissionTriggered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pmId" TEXT,
ADD COLUMN     "primarySalesId" TEXT,
ADD COLUMN     "primarySalesPct" DECIMAL(5,2) DEFAULT 100,
ADD COLUMN     "secondarySalesId" TEXT,
ADD COLUMN     "secondarySalesPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "showEarnings" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "territory" TEXT;

-- CreateTable
CREATE TABLE "pay_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crmJobId" TEXT NOT NULL,
    "payComponentId" TEXT,
    "creditPct" DECIMAL(5,2) NOT NULL,
    "jobValue" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payRunId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetAmount" DECIMAL(10,2) NOT NULL,
    "period" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_components_tenantId_userId_idx" ON "pay_components"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "commission_entries_tenantId_userId_idx" ON "commission_entries"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "commission_entries_tenantId_crmJobId_idx" ON "commission_entries"("tenantId", "crmJobId");

-- CreateIndex
CREATE INDEX "sales_targets_tenantId_userId_idx" ON "sales_targets"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_primarySalesId_fkey" FOREIGN KEY ("primarySalesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_secondarySalesId_fkey" FOREIGN KEY ("secondarySalesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_crmJobId_fkey" FOREIGN KEY ("crmJobId") REFERENCES "crm_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
