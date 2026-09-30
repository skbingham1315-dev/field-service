-- Phone Bridge: Device Registration
CREATE TABLE "phone_bridge_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceModel" TEXT,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "pushToken" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "phone_bridge_devices_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Threads
CREATE TABLE "phone_threads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "customerId" TEXT,
    "contactId" TEXT,
    "isKnown" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "phone_threads_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Messages
CREATE TABLE "phone_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'captured',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_messages_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Calls
CREATE TABLE "phone_calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "hasVoicemail" BOOLEAN NOT NULL DEFAULT false,
    "autoReplySent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_calls_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Auto-Reply Log
CREATE TABLE "phone_auto_reply_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "replyType" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "templateFallback" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_auto_reply_logs_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Draft Replies
CREATE TABLE "phone_draft_replies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'mcp',
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "phone_draft_replies_pkey" PRIMARY KEY ("id")
);

-- Phone Bridge: Geofence Events
CREATE TABLE "phone_geofence_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoTextSent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "phone_geofence_events_pkey" PRIMARY KEY ("id")
);

-- MCP Audit Log
CREATE TABLE "mcp_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "phone_bridge_devices_tokenHash_key" ON "phone_bridge_devices"("tokenHash");
CREATE UNIQUE INDEX "phone_threads_tenantId_phoneNumber_key" ON "phone_threads"("tenantId", "phoneNumber");

-- Indexes
CREATE INDEX "phone_bridge_devices_tenantId_idx" ON "phone_bridge_devices"("tenantId");
CREATE INDEX "phone_threads_tenantId_lastMessageAt_idx" ON "phone_threads"("tenantId", "lastMessageAt");
CREATE INDEX "phone_threads_customerId_idx" ON "phone_threads"("customerId");
CREATE INDEX "phone_messages_threadId_timestamp_idx" ON "phone_messages"("threadId", "timestamp");
CREATE INDEX "phone_messages_tenantId_timestamp_idx" ON "phone_messages"("tenantId", "timestamp");
CREATE INDEX "phone_calls_threadId_timestamp_idx" ON "phone_calls"("threadId", "timestamp");
CREATE INDEX "phone_calls_tenantId_direction_idx" ON "phone_calls"("tenantId", "direction");
CREATE INDEX "phone_auto_reply_logs_tenantId_sentAt_idx" ON "phone_auto_reply_logs"("tenantId", "sentAt");
CREATE INDEX "phone_auto_reply_logs_phoneNumber_sentAt_idx" ON "phone_auto_reply_logs"("phoneNumber", "sentAt");
CREATE INDEX "phone_draft_replies_tenantId_status_idx" ON "phone_draft_replies"("tenantId", "status");
CREATE INDEX "phone_draft_replies_threadId_idx" ON "phone_draft_replies"("threadId");
CREATE INDEX "phone_geofence_events_tenantId_jobId_idx" ON "phone_geofence_events"("tenantId", "jobId");
CREATE INDEX "mcp_audit_logs_tenantId_timestamp_idx" ON "mcp_audit_logs"("tenantId", "timestamp");

-- Foreign keys
ALTER TABLE "phone_bridge_devices" ADD CONSTRAINT "phone_bridge_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_threads" ADD CONSTRAINT "phone_threads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_threads" ADD CONSTRAINT "phone_threads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phone_messages" ADD CONSTRAINT "phone_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_messages" ADD CONSTRAINT "phone_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "phone_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "phone_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_auto_reply_logs" ADD CONSTRAINT "phone_auto_reply_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_auto_reply_logs" ADD CONSTRAINT "phone_auto_reply_logs_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "phone_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_draft_replies" ADD CONSTRAINT "phone_draft_replies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_draft_replies" ADD CONSTRAINT "phone_draft_replies_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "phone_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_geofence_events" ADD CONSTRAINT "phone_geofence_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_geofence_events" ADD CONSTRAINT "phone_geofence_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
