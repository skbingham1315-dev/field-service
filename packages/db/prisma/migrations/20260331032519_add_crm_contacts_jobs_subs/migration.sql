-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('business', 'individual');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('prospect', 'contacted', 'follow_up', 'try_later', 'scheduled', 'new_client', 'active_client', 'on_hold', 'do_not_contact');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('natural_contact', 'door_to_door', 'business_referral', 'cold_outreach', 'social_media', 'online_ad', 'google_search', 'past_customer', 'other');

-- CreateEnum
CREATE TYPE "ActivityEntryType" AS ENUM ('call', 'email', 'visit', 'text', 'estimate_sent', 'job_completed', 'note', 'status_change', 'follow_up_set');

-- CreateEnum
CREATE TYPE "CRMJobStatus" AS ENUM ('estimate_pending', 'estimate_sent', 'approved', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid', 'on_hold', 'cancelled', 'warranty_callback');

-- CreateEnum
CREATE TYPE "JobExecutionType" AS ENUM ('in_house', 'subcontracted');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL DEFAULT 'individual',
    "businessName" TEXT,
    "contactPerson" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "fullName" TEXT,
    "howWeMet" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'prospect',
    "leadSource" "LeadSource" NOT NULL,
    "leadSourceOther" TEXT,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_activities" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "ActivityEntryType" NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "serviceAddress" TEXT,
    "serviceCity" TEXT,
    "serviceState" TEXT,
    "serviceZip" TEXT,
    "tradeCategory" TEXT,
    "status" "CRMJobStatus" NOT NULL DEFAULT 'estimate_pending',
    "executionType" "JobExecutionType" NOT NULL DEFAULT 'in_house',
    "assignedToId" TEXT,
    "subcontractorId" TEXT,
    "estimatedStartDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "estimatedValue" DECIMAL(10,2),
    "actualInvoiceAmount" DECIMAL(10,2),
    "permitRequired" TEXT,
    "permitNumber" TEXT,
    "notes" TEXT,
    "subPaymentType" TEXT,
    "subPaymentAmount" DECIMAL(10,2),
    "subPaymentPercent" DECIMAL(5,2),
    "materialsCost" DECIMAL(10,2),
    "otherCosts" DECIMAL(10,2),
    "targetMargin" DECIMAL(5,2) DEFAULT 25,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_job_activities" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "ActivityEntryType" NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_job_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "licenseNumber" TEXT,
    "insuranceExpDate" TIMESTAMP(3),
    "tradeSpecialties" TEXT[],
    "defaultRateType" TEXT,
    "defaultPercentage" DECIMAL(5,2),
    "notes" TEXT,
    "reliabilityRating" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_tenantId_status_idx" ON "contacts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "contacts_tenantId_leadSource_idx" ON "contacts"("tenantId", "leadSource");

-- CreateIndex
CREATE INDEX "contacts_tenantId_followUpDate_idx" ON "contacts"("tenantId", "followUpDate");

-- CreateIndex
CREATE INDEX "contact_activities_contactId_idx" ON "contact_activities"("contactId");

-- CreateIndex
CREATE INDEX "crm_jobs_tenantId_status_idx" ON "crm_jobs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "crm_jobs_contactId_idx" ON "crm_jobs"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_jobs_tenantId_jobNumber_key" ON "crm_jobs"("tenantId", "jobNumber");

-- CreateIndex
CREATE INDEX "crm_job_activities_jobId_idx" ON "crm_job_activities"("jobId");

-- CreateIndex
CREATE INDEX "subcontractors_tenantId_idx" ON "subcontractors"("tenantId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_job_activities" ADD CONSTRAINT "crm_job_activities_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "crm_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
