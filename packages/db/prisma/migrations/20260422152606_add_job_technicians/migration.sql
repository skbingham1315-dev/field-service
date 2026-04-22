-- CreateTable
CREATE TABLE "job_technicians" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_technicians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_technicians_jobId_idx" ON "job_technicians"("jobId");

-- CreateIndex
CREATE INDEX "job_technicians_userId_idx" ON "job_technicians"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "job_technicians_jobId_userId_key" ON "job_technicians"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "job_technicians" ADD CONSTRAINT "job_technicians_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_technicians" ADD CONSTRAINT "job_technicians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
