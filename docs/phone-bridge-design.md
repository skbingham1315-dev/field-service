# Phone Bridge Design Doc

**Status:** Approved (user said "don't stop till its done")
**Device:** Samsung Galaxy S24 (Android 14+)
**Business hours:** Monday-Friday, 9 AM - 5 PM, America/Phoenix (no DST)

---

## Current State

- **Stack:** Express.js + Prisma + PostgreSQL + React/Vite monorepo on Railway
- **SMS:** Twilio SDK wired in `lib/sms.ts`, `SmsMessage` model stores history
- **AI:** Claude integration in `routes/ai.ts` with tool-use loop, encrypted tenant keys
- **Auth:** JWT (15m access / 7d refresh), role-based middleware
- **Portal:** Customer portal with magic link / OTP auth, messaging, work requests
- **No existing:** call capture, phone message threading, MCP server, Android app

## Architecture

```
[Galaxy S24]                    [Railway]                     [Claude Desktop/Web]
Android App  ──HTTPS/JWT──>  Ingestion API                        │
  SMS observer                  │                                  │
  Call log listener             ├── Phone Bridge routes            │
  Auto-reply engine             │     /api/phone-bridge/*          │
  Geofence monitor              │                                  │
  Receipt camera                ├── Auto-reply engine              │
  Offline queue                 │     Claude API for drafts        │
                                │                                  │
                                ├── MCP Server  <──HTTPS/OAuth──── ┘
                                │     /mcp/*
                                │     read + write tools
                                │
                                └── PostgreSQL (same DB)
```

All three components share the same Railway deployment and database. The MCP server is a separate Express router mounted at `/mcp`.

## Data Model Additions

### PhoneBridgeDevice
Registered Android device. One per tenant for v1.
- id, tenantId, deviceName, deviceModel, tokenHash, isActive, lastSeenAt, pushToken, config (JSON: business hours, templates, allowlist)

### PhoneThread
Conversation grouped by normalized phone number.
- id, tenantId, phoneNumber, displayName, customerId? (linked when matched), contactId?, isKnown, lastMessageAt, lastMessagePreview, unreadCount, isArchived

### PhoneMessage
Individual message captured from the phone or sent via auto-reply.
- id, tenantId, threadId, direction (inbound/outbound), body, bodyEncrypted, source (captured/auto_reply/draft_approved/twilio), timestamp, isRead, metadata (JSON)

### PhoneCall
Call log entry.
- id, tenantId, threadId, phoneNumber, direction (inbound/outbound/missed), duration, timestamp, hasVoicemail, autoReplySent

### PhoneAutoReplyLog
Every auto-reply sent (for audit and rate limiting).
- id, tenantId, threadId, phoneNumber, replyType (missed_call/after_hours/arrival), body, aiGenerated, templateFallback, sentAt

### PhoneDraftReply
Queued drafts awaiting phone-side approval.
- id, tenantId, threadId, body, status (pending/approved/rejected/expired), source (mcp/ai/manual), createdAt, decidedAt, jobId?

### PhoneGeofenceEvent
Arrival/departure at job sites.
- id, tenantId, jobId, eventType (arrival/departure), lat, lng, timestamp, autoTextSent

### McpAuditLog
Every MCP tool invocation.
- id, tenantId, userId, tool, input (JSON), output (JSON), timestamp

## MCP Tool List

### Read Tools (no confirmation needed)
| Tool | Inputs | Output |
|------|--------|--------|
| search_messages | query, phoneNumber?, dateRange? | Messages matching criteria |
| get_thread | threadId or phoneNumber | Full thread with messages |
| list_missed_calls | dateRange?, limit? | Missed calls with auto-reply status |
| list_unanswered_threads | limit? | Threads with no outbound reply |
| get_customer | customerId or search | Customer details + service addresses |
| list_jobs | status?, dateRange?, search? | Jobs with customer/tech info |
| get_job | jobId | Full job details |
| list_unpaid_invoices | limit?, customerId? | Unpaid invoices with amounts |
| get_job_time_log | jobId | Time entries for a job |

### Write Tools (require confirmation; texts require phone approval)
| Tool | Inputs | Output | Confirmation |
|------|--------|--------|-------------|
| draft_text_reply | threadId, body | Draft ID, queued for phone approval | Phone notification |
| create_job_from_thread | threadId, title, scheduledStart | Job ID | Server confirm |
| schedule_job | jobId, scheduledStart, technicianId? | Updated job | Server confirm |
| add_job_note | jobId, content, isInternal? | Note ID | Server confirm |
| attach_receipt_to_job | jobId, fileId | Attachment ID | Server confirm |

## Security Plan

1. Device auth: HMAC-SHA256 token, stored hashed, rotatable, revocable via kill switch
2. TLS everywhere (Railway provides HTTPS)
3. Message bodies encrypted at rest (AES-256-GCM, key in env var)
4. MCP server: OAuth 2.0 bearer token auth, scoped to tenant
5. Audit log on every MCP read/write
6. Rate limits: 100 req/min device endpoint, 60 req/min MCP
7. Prompt injection defense: customer messages delimited as `<user_message>` blocks
8. Kill switch: revoke device token + disable MCP in one API call
9. No call recording in v1

## AI-Personalized Replies

- Backend calls Claude API (claude-haiku-4-5-20251001 for cost efficiency)
- Context: customer name, new/returning, open jobs, last messages, business hours status
- Auto-send ONLY for: after-hours ack, missed-call ack (must only acknowledge + set expectations)
- Everything else: draft + phone approval
- Hard rules in system prompt: no prices, no dates, no promises, no other customer info
- Fail-safe: if API errors or validation fails, send fixed template
- Cost controls: max 300 tokens output, rate limit 10/min per number

## Phased Build Plan

1. **Phase 1:** Prisma models + device auth + ingestion API
2. **Phase 2:** Android app: SMS/call capture, offline queue, device registration
3. **Phase 3:** Auto-reply engine (missed call + after-hours + AI drafts)
4. **Phase 4:** MCP server with read tools
5. **Phase 5:** MCP write tools with confirmations
6. **Phase 6:** Geofence + receipt capture

## Open Questions (resolved)

- Q: Is the business phone Android? **A: Yes, Galaxy S24**
- Q: Ingestion as FieldOps module or separate service? **A: Same service, new router**
