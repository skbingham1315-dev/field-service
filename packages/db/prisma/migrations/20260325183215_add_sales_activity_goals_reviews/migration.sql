-- CreateTable
CREATE TABLE "sales_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "doorsKnocked" INTEGER NOT NULL DEFAULT 0,
    "peopleContacted" INTEGER NOT NULL DEFAULT 0,
    "estimatesGiven" INTEGER NOT NULL DEFAULT 0,
    "leadsAdded" INTEGER NOT NULL DEFAULT 0,
    "jobsScheduled" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_goals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doorsKnocked" INTEGER NOT NULL DEFAULT 20,
    "peopleContacted" INTEGER NOT NULL DEFAULT 10,
    "estimatesGiven" INTEGER NOT NULL DEFAULT 5,
    "leadsAdded" INTEGER NOT NULL DEFAULT 3,
    "jobsScheduled" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "technicianId" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "reviewToken" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_activities_tenantId_date_idx" ON "sales_activities"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_activities_userId_date_key" ON "sales_activities"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_goals_tenantId_key" ON "sales_goals"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "job_reviews_jobId_key" ON "job_reviews"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "job_reviews_reviewToken_key" ON "job_reviews"("reviewToken");

-- CreateIndex
CREATE INDEX "job_reviews_tenantId_idx" ON "job_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "job_reviews_technicianId_idx" ON "job_reviews"("technicianId");

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reviews" ADD CONSTRAINT "job_reviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reviews" ADD CONSTRAINT "job_reviews_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
