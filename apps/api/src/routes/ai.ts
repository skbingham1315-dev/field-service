import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { sendSms } from '../lib/sms';
import { geocodeAndSave } from '../lib/geocode';
import type { ApiResponse } from '@fsp/types';
import crypto from 'crypto';

// ── Encryption helpers for stored API keys ─────────────────────────────────────
const ENC_KEY_HEX = process.env.AI_KEY_ENCRYPTION_KEY ?? '';
const ENC_ENABLED = ENC_KEY_HEX.length === 64; // 32-byte key as 64-char hex

function encryptApiKey(plaintext: string): string {
  if (!ENC_ENABLED) return plaintext;
  const key = Buffer.from(ENC_KEY_HEX, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptApiKey(stored: string): string {
  if (!ENC_ENABLED || !stored.startsWith('enc:')) return stored;
  try {
    const parts = stored.split(':');
    const key = Buffer.from(ENC_KEY_HEX, 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const data = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    return stored; // fall back to raw if decryption fails (e.g. old unencrypted value)
  }
}

export const aiRouter = Router();
aiRouter.use(authenticate);

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_jobs',
    description: 'List jobs. Can filter by status, date, or search term. Returns upcoming and recent jobs.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: scheduled, in_progress, completed, cancelled' },
        date: { type: 'string', description: 'Filter by date YYYY-MM-DD' },
        search: { type: 'string', description: 'Search by job title or customer name' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'create_job',
    description: 'Create a new job / appointment. Requires title, customerId, and scheduledStart. Will use the customer\'s existing service address or create one if address fields are provided.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        customerId: { type: 'string', description: 'Get from list_customers first' },
        technicianId: { type: 'string', description: 'User ID to assign (optional)' },
        scheduledStart: { type: 'string', description: 'ISO datetime e.g. 2026-03-27T09:00:00' },
        scheduledEnd: { type: 'string', description: 'ISO datetime for end (optional)' },
        description: { type: 'string' },
        serviceType: { type: 'string', description: 'pool | pest_control | turf | handyman' },
        street: { type: 'string', description: 'Service address street (optional if customer already has one)' },
        city: { type: 'string', description: 'Service address city' },
        state: { type: 'string', description: 'Service address state' },
        zip: { type: 'string', description: 'Service address zip code' },
      },
      required: ['title', 'customerId', 'scheduledStart'],
    },
  },
  {
    name: 'list_customers',
    description: 'Search for customers by name, email, or phone.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Name, email, or phone' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer record.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'list_technicians',
    description: 'List available technicians for job assignment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_schedule',
    description: 'Get the job schedule for a specific date.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'update_job',
    description: 'Update an existing job/appointment. Can change title, scheduled time, technician, status, description, or service type. Use list_jobs first to get the job ID.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'The job ID to update' },
        title: { type: 'string', description: 'New title (optional)' },
        scheduledStart: { type: 'string', description: 'New start datetime ISO e.g. 2026-03-27T09:00:00 (optional)' },
        scheduledEnd: { type: 'string', description: 'New end datetime ISO (optional)' },
        technicianId: { type: 'string', description: 'New technician user ID, or "unassign" to remove (optional)' },
        status: { type: 'string', description: 'New status: scheduled | in_progress | completed | cancelled (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        serviceType: { type: 'string', description: 'New service type: pool | pest_control | turf | handyman (optional)' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'update_customer',
    description: 'Update an existing customer\'s information such as name, email, or phone number. Use list_customers first to get the customer ID.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'The customer ID to update' },
        firstName: { type: 'string', description: 'New first name (optional)' },
        lastName: { type: 'string', description: 'New last name (optional)' },
        email: { type: 'string', description: 'New email address (optional)' },
        phone: { type: 'string', description: 'New phone number (optional)' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'send_reminder',
    description: 'Send an SMS reminder to a customer about their upcoming appointment.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        customMessage: { type: 'string', description: 'Optional custom message' },
      },
      required: ['jobId'],
    },
  },
];

function allowedTools(role: string): string[] {
  if (role === 'technician') return ['list_jobs', 'get_schedule'];
  if (role === 'sales') return ['list_jobs', 'create_job', 'update_job', 'list_customers', 'create_customer', 'update_customer', 'get_schedule'];
  return TOOLS.map((t) => t.name);
}

async function executeTool(name: string, input: Record<string, unknown>, tenantId: string, userId: string) {
  switch (name) {
    case 'list_jobs': {
      const where: Record<string, unknown> = { tenantId };
      if (input.status) where.status = input.status;
      if (input.date) {
        const d = new Date(input.date as string);
        const next = new Date(d); next.setDate(next.getDate() + 1);
        where.scheduledStart = { gte: d, lt: next };
      }
      if (input.search) {
        where.OR = [
          { title: { contains: input.search as string, mode: 'insensitive' } },
          { customer: { firstName: { contains: input.search as string, mode: 'insensitive' } } },
          { customer: { lastName: { contains: input.search as string, mode: 'insensitive' } } },
        ];
      }
      const jobs = await prisma.job.findMany({
        where,
        take: Number(input.limit) || 10,
        orderBy: { scheduledStart: 'asc' },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          technician: { select: { firstName: true, lastName: true } },
        },
      });
      return jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        scheduledStart: j.scheduledStart,
        customer: j.customer ? `${j.customer.firstName} ${j.customer.lastName}` : null,
        technician: j.technician ? `${j.technician.firstName} ${j.technician.lastName}` : 'Unassigned',
      }));
    }

    case 'create_job': {
      const validTypes = ['pool', 'pest_control', 'turf', 'handyman'];
      const svcType = input.serviceType as string;
      const customerId = input.customerId as string;

      // Find existing service address or create one
      let serviceAddressId: string;
      const existing = await prisma.serviceAddress.findFirst({
        where: { customerId },
        orderBy: { isPrimary: 'desc' },
        select: { id: true },
      });

      if (existing) {
        serviceAddressId = existing.id;
      } else {
        const street = (input.street as string) || 'TBD';
        const city = (input.city as string) || 'TBD';
        const state = (input.state as string) || 'TBD';
        const zip = (input.zip as string) || '00000';
        const addr = await prisma.serviceAddress.create({
          data: { customerId, street, city, state, zip, isPrimary: true },
          select: { id: true },
        });
        serviceAddressId = addr.id;
        if (street !== 'TBD') geocodeAndSave(addr.id, { street, city, state, zip });
      }

      const job = await prisma.job.create({
        data: {
          tenantId,
          title: input.title as string,
          customerId,
          serviceAddressId,
          technicianId: (input.technicianId as string) || null,
          scheduledStart: new Date(input.scheduledStart as string),
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd as string) : null,
          description: (input.description as string) || null,
          serviceType: (validTypes.includes(svcType) ? svcType : 'pool') as never,
          status: 'scheduled',
        },
        include: { customer: { select: { firstName: true, lastName: true } } },
      }) as never as { id: string; title: string; scheduledStart: Date | null; status: string; customer: { firstName: string; lastName: string } | null };
      return {
        id: job.id,
        title: job.title,
        scheduledStart: job.scheduledStart,
        customer: job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : null,
        status: job.status,
      };
    }

    case 'list_customers': {
      const search = input.search as string | undefined;
      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          ...(search ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          } : {}),
        },
        take: Number(input.limit) || 10,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });
      return customers;
    }

    case 'create_customer': {
      const customer = await prisma.customer.create({
        data: {
          tenantId,
          firstName: input.firstName as string,
          lastName: input.lastName as string,
          email: (input.email as string) || null,
          phone: (input.phone as string) || null,
        },
      });
      return { id: customer.id, name: `${customer.firstName} ${customer.lastName}`, email: customer.email, phone: customer.phone };
    }

    case 'list_technicians': {
      const techs = await prisma.user.findMany({
        where: { tenantId, role: 'technician', status: 'active' },
        select: { id: true, firstName: true, lastName: true, isAvailable: true },
      });
      return techs.map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}`, available: t.isAvailable }));
    }

    case 'get_schedule': {
      const d = new Date(input.date as string);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const jobs = await prisma.job.findMany({
        where: { tenantId, scheduledStart: { gte: d, lt: next }, status: { notIn: ['cancelled'] } },
        orderBy: { scheduledStart: 'asc' },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          technician: { select: { firstName: true, lastName: true } },
        },
      });
      return jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        time: j.scheduledStart ? new Date(j.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD',
        customer: j.customer ? `${j.customer.firstName} ${j.customer.lastName}` : null,
        technician: j.technician ? `${j.technician.firstName} ${j.technician.lastName}` : 'Unassigned',
      }));
    }

    case 'update_job': {
      const validTypes = ['pool', 'pest_control', 'turf', 'handyman'];
      const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
      const data: Record<string, unknown> = {};
      if (input.title) data.title = input.title;
      if (input.scheduledStart) data.scheduledStart = new Date(input.scheduledStart as string);
      if (input.scheduledEnd) data.scheduledEnd = new Date(input.scheduledEnd as string);
      if (input.description !== undefined) data.description = input.description;
      if (input.technicianId) {
        data.technicianId = (input.technicianId as string) === 'unassign' ? null : input.technicianId;
      }
      if (input.status && validStatuses.includes(input.status as string)) data.status = input.status;
      if (input.serviceType && validTypes.includes(input.serviceType as string)) data.serviceType = input.serviceType;

      const job = await prisma.job.update({
        where: { id: input.jobId as string },
        data,
        include: { customer: { select: { firstName: true, lastName: true } } },
      }) as never as { id: string; title: string; scheduledStart: Date | null; status: string; customer: { firstName: string; lastName: string } | null };
      return {
        id: job.id,
        title: job.title,
        scheduledStart: job.scheduledStart,
        status: job.status,
        customer: job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : null,
      };
    }

    case 'update_customer': {
      const data: Record<string, unknown> = {};
      if (input.firstName) data.firstName = input.firstName;
      if (input.lastName) data.lastName = input.lastName;
      if (input.email !== undefined) data.email = input.email || null;
      if (input.phone !== undefined) data.phone = input.phone || null;

      const customer = await prisma.customer.update({
        where: { id: input.customerId as string },
        data,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });
      return { id: customer.id, name: `${customer.firstName} ${customer.lastName}`, email: customer.email, phone: customer.phone };
    }

    case 'send_reminder': {
      const job = await prisma.job.findUnique({
        where: { id: input.jobId as string },
        include: { customer: { select: { id: true, firstName: true, phone: true } } },
      });
      if (!job?.customer?.phone) return { success: false, reason: 'Customer has no phone number on file.' };
      const scheduledAt = job.scheduledStart ? new Date(job.scheduledStart) : null;
      const date = scheduledAt ? scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'your upcoming appointment';
      const time = scheduledAt ? scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
      const body = (input.customMessage as string) ||
        `Hi ${job.customer.firstName}, reminder: your appointment "${job.title}" is scheduled for ${date}${time ? ' at ' + time : ''}. Reply STOP to opt out.`;
      await sendSms({ tenantId, customerId: job.customer.id, to: job.customer.phone, body });
      return { success: true, sentTo: job.customer.phone };
    }

    default:
      return { error: 'Unknown tool' };
  }
}

// ── AI Config endpoints ────────────────────────────────────────────────────────

aiRouter.get('/config', requireRole('owner', 'admin'), async (req, res) => {
  const tenant = await prisma.$queryRawUnsafe<Array<{ aiProvider: string | null; aiApiKey: string | null }>>(
    `SELECT "aiProvider", "aiApiKey" FROM "tenants" WHERE id = $1`, req.user!.tenantId,
  );
  const row = tenant[0];
  // Decrypt to get the real key for the hint, but never return the full key
  const plainKey = row?.aiApiKey ? decryptApiKey(row.aiApiKey) : null;
  res.json({
    success: true,
    data: {
      aiProvider: row?.aiProvider ?? null,
      aiApiKeySet: !!(row?.aiApiKey),
      aiApiKeyHint: plainKey ? `...${plainKey.slice(-4)}` : null,
    },
  } satisfies ApiResponse);
});

aiRouter.post('/config', requireRole('owner', 'admin'), async (req, res) => {
  const { aiProvider, aiApiKey } = req.body as { aiProvider: string; aiApiKey?: string };
  const validProviders = ['anthropic', 'openai', 'gemini'];
  if (!validProviders.includes(aiProvider)) {
    res.status(400).json({ success: false, message: 'Invalid provider. Choose: anthropic, openai, gemini' });
    return;
  }
  const updates: string[] = [`"aiProvider" = $2`];
  const params: unknown[] = [req.user!.tenantId, aiProvider];
  if (aiApiKey !== undefined && aiApiKey !== '') {
    updates.push(`"aiApiKey" = $${params.length + 1}`);
    params.push(encryptApiKey(aiApiKey));
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "tenants" SET ${updates.join(', ')} WHERE id = $1`, ...params,
  );
  res.json({ success: true, data: { message: 'AI config saved' } } satisfies ApiResponse);
});

// Convert Anthropic tool format → OpenAI tool format
function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
}

// ── Claude (Anthropic) chat ────────────────────────────────────────────────────

async function chatWithClaude(
  apiKey: string, systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Anthropic.Tool[], tenantId: string, userId: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const anthropicMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const extraMessages: Anthropic.MessageParam[] = [];

  let response = await client.messages.create({ model: 'claude-opus-4-6', max_tokens: 1024, system: systemPrompt, tools, messages: anthropicMessages });

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input as Record<string, unknown>, tenantId, userId);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
    }
    extraMessages.push({ role: 'assistant', content: response.content });
    extraMessages.push({ role: 'user', content: toolResults });
    response = await client.messages.create({ model: 'claude-opus-4-6', max_tokens: 1024, system: systemPrompt, tools, messages: [...anthropicMessages, ...extraMessages] });
  }
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
}

// ── OpenAI / Gemini chat (Gemini uses OpenAI-compatible API) ──────────────────

async function chatWithOpenAI(
  apiKey: string, provider: 'openai' | 'gemini',
  systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Anthropic.Tool[], tenantId: string, userId: string,
): Promise<string> {
  const isGemini = provider === 'gemini';
  const client = new OpenAI({
    apiKey,
    ...(isGemini ? { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' } : {}),
  });
  const model = isGemini ? 'gemini-2.0-flash' : 'gpt-4o';
  const oaiTools = toOpenAITools(tools);

  const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  let response = await client.chat.completions.create({ model, max_tokens: 1024, tools: oaiTools, messages: oaiMessages });

  while (response.choices[0]?.finish_reason === 'tool_calls') {
    const msg = response.choices[0].message;
    oaiMessages.push(msg);
    const toolCalls = msg.tool_calls ?? [];
    for (const tc of toolCalls) {
      const fn = (tc as { function: { name: string; arguments: string } }).function;
      const result = await executeTool(fn.name, JSON.parse(fn.arguments || '{}'), tenantId, userId);
      oaiMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    response = await client.chat.completions.create({ model, max_tokens: 1024, tools: oaiTools, messages: oaiMessages });
  }
  return response.choices[0]?.message?.content ?? '';
}

// ── Main chat endpoint ─────────────────────────────────────────────────────────

aiRouter.post('/chat', async (req, res) => {
  const { messages, timezone } = req.body as { messages: Array<{ role: 'user' | 'assistant'; content: string }>; timezone?: string };
  const { tenantId, role, sub: userId } = req.user!;

  if (!messages?.length) {
    res.status(400).json({ success: false, message: 'messages required' });
    return;
  }

  // Look up tenant's configured AI provider
  const tenantRows = await prisma.$queryRawUnsafe<Array<{ aiProvider: string | null; aiApiKey: string | null }>>(
    `SELECT "aiProvider", "aiApiKey" FROM "tenants" WHERE id = $1`, tenantId,
  );
  const tenantAiProvider = (tenantRows[0]?.aiProvider ?? null) as 'anthropic' | 'openai' | 'gemini' | null;
  const rawStoredKey = tenantRows[0]?.aiApiKey ?? null;
  const tenantAiKey = rawStoredKey ? decryptApiKey(rawStoredKey) : null;

  // Fall back to server-level Anthropic key if tenant hasn't configured their own
  const effectiveProvider = tenantAiProvider ?? 'anthropic';
  const effectiveKey = tenantAiKey ?? process.env.ANTHROPIC_API_KEY ?? '';

  if (!effectiveKey) {
    res.status(503).json({ success: false, message: 'NO_AI_KEY' });
    return;
  }

  const tools = TOOLS.filter((t) => allowedTools(role).includes(t.name));
  const tz = timezone || 'America/Phoenix';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const nowLocal = new Date().toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  const systemPrompt = `You are an AI assistant for a field service management platform.
Current date/time for the user: ${nowLocal} (timezone: ${tz}, today's date: ${today}).
The user's role is: ${role}.
You help with ${role === 'technician' ? 'checking schedules and jobs' : role === 'sales' ? 'creating customers and scheduling appointments' : 'creating jobs, finding customers, scheduling, and sending reminders'}.
Be concise and action-oriented. When creating jobs or customers, confirm details only if something is ambiguous.
Always use tools to take real actions — never fabricate IDs or data.
IMPORTANT: All scheduled times the user mentions are in their local timezone (${tz}). Convert to ISO datetime for create_job/update_job.
When you complete an action, tell the user clearly what was done.`;

  let text: string;
  try {
    if (effectiveProvider === 'anthropic') {
      text = await chatWithClaude(effectiveKey, systemPrompt, messages, tools, tenantId, userId);
    } else {
      text = await chatWithOpenAI(effectiveKey, effectiveProvider as 'openai' | 'gemini', systemPrompt, messages, tools, tenantId, userId);
    }
  } catch (err: any) {
    const errMsg = err?.error?.error?.message ?? err?.message ?? '';
    if (errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('balance')) {
      res.status(503).json({ success: false, message: 'NO_CREDITS' });
      return;
    }
    if (errMsg.toLowerCase().includes('invalid') && errMsg.toLowerCase().includes('key')) {
      res.status(503).json({ success: false, message: 'INVALID_KEY' });
      return;
    }
    throw err;
  }

  res.json({ success: true, data: { message: text } });
});
