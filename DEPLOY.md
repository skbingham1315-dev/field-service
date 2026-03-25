# Deployment Guide

This guide covers deploying the Field Service Platform to production:
API + database + cache on **Railway**, frontend on **Vercel**.

---

## Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User's browser                                             │
│  https://your-app.vercel.app                                │
│           │                                                 │
│           │  HTTPS (REST + WebSocket)                       │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Railway project                                    │   │
│  │                                                     │   │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────┐  │   │
│  │  │  API service │   │  PostgreSQL  │   │  Redis  │  │   │
│  │  │  Node/Express│◄──│  (Railway    │   │ (Railway│  │   │
│  │  │  port 3001   │   │   plugin)    │   │ plugin) │  │   │
│  │  └──────┬──────┘   └──────────────┘   └─────────┘  │   │
│  │         │                                           │   │
│  └─────────┼─────────────────────────────────────────-┘   │
│            │  Outbound calls                               │
│     ┌──────┼──────────────────────────────────┐           │
│     │      ▼           ▼           ▼           │           │
│     │  Resend       Twilio      Stripe         │           │
│     │  (email)      (SMS)       (payments)     │           │
│     │                                          │           │
│     │                  ▼                       │           │
│     │              AWS S3                      │           │
│     │           (photo uploads)                │           │
│     └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Services and why

| Service | Purpose | Pricing |
|---------|---------|---------|
| **Railway** | Hosts API, Postgres, Redis in one project with managed infra | ~$5/mo Hobby plan |
| **Vercel** | Serves React frontend via CDN, handles SPA routing | Free Hobby plan |
| **Resend** | Transactional email (job confirmations, invoices) | Free 3,000 emails/mo |
| **Twilio** | SMS notifications to customers and technicians | ~$0.0079/SMS |
| **Stripe** | Payment processing and subscription billing | 2.9% + 30¢ per transaction |
| **AWS S3** | Before/after job photo storage | ~$0.023/GB/mo |

---

## Prerequisites

Before you begin, create accounts on:

- **Railway** — [railway.app](https://railway.app) — API + Postgres + Redis
- **Vercel** — [vercel.com](https://vercel.com) — Frontend hosting
- **Resend** — [resend.com](https://resend.com) — Email (free 3,000/mo)
- **Twilio** — [console.twilio.com](https://console.twilio.com) — SMS (~$0.0079/msg)
- **Stripe** — [stripe.com](https://stripe.com) — Payments
- **AWS** — [aws.amazon.com](https://aws.amazon.com) — S3 photo storage
- A **domain name** (optional but required to send email from your own address)

You will also need:

- Node.js 18+ installed locally
- Git repo pushed to GitHub (Railway and Vercel connect via GitHub)

---

## Step 1: Deploy API to Railway

### 1.1 Install the Railway CLI

```bash
npm install -g @railway/cli
```

### 1.2 Log in

```bash
railway login
```

### 1.3 Initialise a new project

Run this from the repo root:

```bash
railway init
```

Select **"Create new project"** and give it a name (e.g. `field-service-platform`).

### 1.4 Add PostgreSQL

In the Railway dashboard for your project:

1. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Once provisioned, click the Postgres service → **"Variables"** tab
3. Copy the `DATABASE_URL` value (it will look like `postgresql://postgres:xxx@xxx.railway.internal:5432/railway`)

> Railway injects `DATABASE_URL` automatically into services in the same project, so you only need to copy it for reference — you don't have to set it manually unless it is not auto-injected.

### 1.5 Add Redis

1. Click **"+ New"** → **"Database"** → **"Add Redis"**
2. Once provisioned, copy the `REDIS_URL` value from its **"Variables"** tab

### 1.6 Set environment variables

In the Railway dashboard, select your API service → **"Variables"** tab → add each variable:

| Variable | Required | Value / Notes |
|----------|----------|---------------|
| `DATABASE_URL` | Yes | Auto-injected from Postgres plugin |
| `REDIS_URL` | Yes | Auto-injected from Redis plugin |
| `JWT_SECRET` | Yes | Random string, min 32 chars (use `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | Yes | Different random string, min 32 chars |
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Railway sets this automatically |
| `WEB_URL` | Yes | Your Vercel URL (set after Step 4, then update) |
| `RESEND_API_KEY` | Yes | From Resend dashboard (Step 2) |
| `EMAIL_FROM` | Yes | e.g. `FSP <noreply@yourdomain.com>` |
| `TWILIO_ACCOUNT_SID` | Yes | From Twilio dashboard (Step 3) |
| `TWILIO_AUTH_TOKEN` | Yes | From Twilio dashboard (Step 3) |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio number in E.164 format |
| `STRIPE_SECRET_KEY` | Yes | `sk_live_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe webhook setup |
| `AWS_ACCESS_KEY_ID` | Yes | From AWS IAM |
| `AWS_SECRET_ACCESS_KEY` | Yes | From AWS IAM |
| `AWS_REGION` | Yes | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | Yes | Your S3 bucket name |

### 1.7 Deploy

Connect your GitHub repo in the Railway dashboard (Settings → Source), or push directly:

```bash
railway up
```

Railway will use `nixpacks.toml` at the repo root to build and start the API. The build:
1. Installs Node 20
2. Runs `npm ci`
3. Generates the Prisma client
4. Compiles TypeScript
5. On start: runs `prisma migrate deploy`, then starts the server

### 1.8 Note your Railway URL

Once deployed, Railway shows a public URL like:

```
https://fsp-api-production.up.railway.app
```

Save this — you need it for Vercel (Step 4) and Twilio (Step 3).

---

## Step 2: Set Up Resend (Email)

### 2.1 Sign up and add your domain

1. Go to [resend.com](https://resend.com) and create an account
2. Navigate to **"Domains"** → **"Add Domain"**
3. Enter your domain (e.g. `yourdomain.com`)
4. Add the DNS records Resend provides (TXT + MX records) in your DNS provider
5. Click **"Verify Domain"** — DNS propagation can take up to 24 hours

> If you don't have a domain yet, you can use Resend's sandbox (`@resend.dev`) for initial testing. Emails will only be deliverable to the address you registered with.

### 2.2 Create an API key

1. Go to **"API Keys"** → **"Create API Key"**
2. Give it a name (e.g. `fsp-production`) and set permission to **"Sending access"**
3. Copy the key immediately — it is only shown once

### 2.3 Set env vars in Railway

Set these two variables on your Railway API service:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=FSP <noreply@yourdomain.com>
```

The `EMAIL_FROM` address must use a domain you have verified in Resend.

---

## Step 3: Set Up Twilio (SMS)

### 3.1 Get your credentials

1. Log in to [console.twilio.com](https://console.twilio.com)
2. On the **"Account Info"** panel (homepage), copy:
   - **Account SID** (starts with `AC`)
   - **Auth Token**

### 3.2 Get a phone number

1. Go to **"Phone Numbers"** → **"Manage"** → **"Buy a number"**
2. Search for a number with SMS capability in your country
3. Purchase it (~$1.15/mo in the US)

> On a Twilio trial account you can use the free trial number but can only send SMS to verified numbers. Upgrade to a paid account for production use.

### 3.3 Set env vars in Railway

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567
```

### 3.4 Configure the inbound SMS webhook

To receive replies from customers:

1. In the Twilio console go to **"Phone Numbers"** → **"Manage"** → **"Active numbers"**
2. Click your number
3. Under **"Messaging Configuration"** → **"A message comes in"**:
   - Set the URL to: `https://YOUR-RAILWAY-URL/webhooks/twilio/sms`
   - Set the method to: **HTTP POST**
4. Click **Save**

### 3.5 Test SMS

Send a text from a customer's phone to your Twilio number. Check **"Monitor"** → **"Logs"** → **"Messaging"** in the Twilio console to confirm delivery.

---

## Step 4: Deploy Frontend to Vercel

### 4.1 Install the Vercel CLI

```bash
npm install -g vercel
```

### 4.2 Deploy

From the **repo root** (not `apps/web`):

```bash
vercel
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → your account
- **Link to existing project?** → No (first deploy)
- **Project name** → e.g. `field-service-platform`
- **In which directory is your code located?** → `./` (repo root — `vercel.json` in `apps/web` handles the rest)

> Vercel will detect `apps/web/vercel.json` and use its `buildCommand`, `outputDirectory`, and `rewrites` automatically.

### 4.3 Set the API URL environment variable

In the Vercel dashboard → your project → **"Settings"** → **"Environment Variables"**:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-RAILWAY-URL` (no trailing slash) |

Apply to **Production**, **Preview**, and **Development** environments.

### 4.4 Deploy to production

```bash
vercel --prod
```

Copy the production URL (e.g. `https://field-service-platform.vercel.app`).

### 4.5 Update WEB_URL in Railway

Go back to your Railway API service → **"Variables"** and update:

```
WEB_URL=https://field-service-platform.vercel.app
```

Then redeploy the Railway service so the CORS config picks up the new value.

---

## Step 5: Post-Deploy Verification

Work through this checklist after deploying:

- [ ] Visit your Vercel URL — the login page loads
- [ ] Log in with `owner@demo.com` / `Password123!` / tenant `demo-pool-co`
- [ ] Dashboard loads with demo data
- [ ] Navigate to Jobs — list loads, create a new job
- [ ] Navigate to Invoices — list loads, create a test invoice
- [ ] Open the Dispatch Board — drag a job card to a technician column
- [ ] Send a test invoice → check customer email in Resend **"Logs"** → **"Emails"**
- [ ] Send a test SMS notification → check Twilio **"Monitor"** → **"Logs"**
- [ ] Upload a job photo — confirm it appears (served from S3)
- [ ] Check Railway logs for any errors: `railway logs`

---

## Environment Variables Reference

Full reference table for all variables used by the API:

| Variable | Required | Description | Where to get it |
|----------|----------|-------------|-----------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Railway Postgres plugin (auto-injected) |
| `REDIS_URL` | Yes | Redis connection string | Railway Redis plugin (auto-injected) |
| `JWT_SECRET` | Yes | Secret for signing access tokens (min 32 chars) | Generate with `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing refresh tokens (min 32 chars) | Generate with `openssl rand -hex 32` |
| `NODE_ENV` | Yes | Runtime environment | Set to `production` |
| `PORT` | No | HTTP port (Railway sets this automatically) | Leave unset on Railway |
| `WEB_URL` | Yes | Frontend origin for CORS | Your Vercel production URL |
| `RESEND_API_KEY` | Yes | Resend API key for sending email | [resend.com](https://resend.com) → API Keys |
| `EMAIL_FROM` | Yes | From address for outbound email | Must be a verified Resend domain |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account identifier | [console.twilio.com](https://console.twilio.com) homepage |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio authentication token | [console.twilio.com](https://console.twilio.com) homepage |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio number in E.164 format | Twilio → Phone Numbers |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key for server-side API calls | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret | Stripe → Developers → Webhooks → your endpoint |
| `AWS_ACCESS_KEY_ID` | Yes | AWS IAM access key for S3 | AWS Console → IAM → Users → your user → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS IAM secret for S3 | Same as above (only shown at creation) |
| `AWS_REGION` | Yes | AWS region where your S3 bucket lives | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | Yes | S3 bucket name for photo uploads | The bucket you created in S3 |

Frontend variable (set in Vercel):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Full Railway API URL, no trailing slash |

---

## Updating the App

### Update the API

```bash
# Push changes to Railway
railway up

# Or trigger a redeploy via GitHub push if you connected a repo
git push origin main
```

### Update the frontend

```bash
# Deploy to Vercel production
cd apps/web && vercel --prod

# Or trigger via GitHub push if connected to Vercel
git push origin main
```

### Run a database migration

Migrations run automatically at startup via `prisma migrate deploy` in the Railway start command. To run manually:

```bash
railway run npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

---

## Troubleshooting

### CORS errors in the browser

**Symptom:** `Access-Control-Allow-Origin` errors in the browser console.

**Fix:** In Railway, check that `WEB_URL` matches your Vercel URL **exactly** — including the protocol and without a trailing slash. After updating the variable, redeploy the Railway service.

```
# Correct
WEB_URL=https://field-service-platform.vercel.app

# Wrong — will break CORS
WEB_URL=https://field-service-platform.vercel.app/
WEB_URL=field-service-platform.vercel.app
```

### SMS not being received

**Symptom:** Texts to your Twilio number are not triggering webhooks or arriving in the app.

**Checklist:**
1. Confirm the webhook URL in Twilio matches your Railway URL exactly: `https://YOUR-RAILWAY-URL/webhooks/twilio/sms`
2. Confirm Railway is running (`railway status`)
3. Check Twilio **"Monitor"** → **"Logs"** → **"Errors"** for failed webhook delivery
4. If using a trial account, confirm the recipient's number is verified in Twilio

### Email not sending

**Symptom:** Emails are not arriving; no errors in Railway logs.

**Checklist:**
1. Confirm `RESEND_API_KEY` is set correctly in Railway (not the placeholder value)
2. Confirm your domain is verified in Resend (**"Domains"** → status should be **"Verified"**)
3. Confirm `EMAIL_FROM` uses that verified domain
4. Check Resend **"Logs"** → **"Emails"** for delivery status and error messages
5. Check spam/junk folders

### Database connection errors

**Symptom:** `Error: Can't reach database server` or Prisma connection errors in Railway logs.

**Checklist:**
1. Confirm the Railway Postgres service is running
2. For Railway Postgres, the internal URL (`railway.internal`) is used for service-to-service communication — make sure you are not using the external TCP URL in the `DATABASE_URL` env var
3. If you are connecting from outside Railway (e.g. local `railway run`), append `?sslmode=require` to the external connection string:
   ```
   postgresql://postgres:xxx@xxx.railway.app:5432/railway?sslmode=require
   ```

### Build failing on Railway

**Symptom:** Railway build errors during `tsc` compilation.

**Checklist:**
1. Make sure the build passes locally first: `cd apps/api && npx tsc -p tsconfig.json`
2. Check that `nixpacks.toml` is committed to the repo root
3. Review Railway build logs for the specific TypeScript error

### Vercel build failing

**Symptom:** Vercel deployment fails with a build error.

**Checklist:**
1. Confirm `apps/web/vercel.json` is committed
2. Make sure the build passes locally: `npm run build -w apps/web`
3. Confirm `VITE_API_URL` is set in Vercel environment variables — a missing variable can cause a runtime (not build) failure, but check logs carefully
