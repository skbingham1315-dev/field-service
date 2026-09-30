import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@fsp/db';
import { logger } from './logger';

const PHOENIX_TZ = 'America/Phoenix';

interface BusinessHoursConfig {
  start: string; // "09:00"
  end: string;   // "17:00"
  days: number[]; // [1,2,3,4,5] = Mon-Fri
  timezone: string;
}

interface AutoReplyConfig {
  businessHours: BusinessHoursConfig;
  missedCallTemplate: string;
  afterHoursTemplate: string;
  allowlist: string[];
  cooldownHours: number;
  useAiReplies: boolean;
}

const DEFAULT_CONFIG: AutoReplyConfig = {
  businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], timezone: PHOENIX_TZ },
  missedCallTemplate: "On a job site, I'll call you back within 2 hours. For estimates, text the address and a few photos.",
  afterHoursTemplate: "Thanks for contacting Blue Dingo Construction & Remodel. Our office hours are Monday through Friday, 9 AM to 5 PM. We're out of the office right now and will get back to you the next business day.",
  allowlist: [],
  cooldownHours: 4,
  useAiReplies: true,
};

export function isWithinBusinessHours(config: BusinessHoursConfig = DEFAULT_CONFIG.businessHours): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone || PHOENIX_TZ,
    hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDay = dayMap[weekday] ?? 0;

  if (!config.days.includes(currentDay)) return false;

  const [startH, startM] = config.start.split(':').map(Number);
  const [endH, endM] = config.end.split(':').map(Number);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function recentAutoReply(phoneNumber: string, tenantId: string, cooldownHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
  const recent = await prisma.phoneAutoReplyLog.findFirst({
    where: { tenantId, phoneNumber, sentAt: { gte: cutoff } },
  });
  return !!recent;
}

function isAllowlisted(phoneNumber: string, allowlist: string[]): boolean {
  const digits = phoneNumber.replace(/\D/g, '');
  return allowlist.some(n => digits.endsWith(n.replace(/\D/g, '').slice(-10)));
}

function isShortCode(phoneNumber: string): boolean {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length <= 6;
}

export async function generateAiReply(opts: {
  tenantId: string;
  phoneNumber: string;
  displayName?: string;
  replyType: 'missed_call' | 'after_hours';
  recentMessages?: string[];
}): Promise<{ body: string; aiGenerated: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { body: '', aiGenerated: false };

  try {
    // Gather context
    const thread = await prisma.phoneThread.findFirst({
      where: { tenantId: opts.tenantId, phoneNumber: opts.phoneNumber },
      include: {
        customer: { select: { firstName: true, lastName: true } },
      },
    });

    const customerName = thread?.customer
      ? `${thread.customer.firstName} ${thread.customer.lastName}`
      : opts.displayName || 'there';

    const isReturning = thread?.customer ? true : (thread?.isKnown ?? false);
    const inBusinessHours = isWithinBusinessHours();

    // Get open jobs for this customer
    let openJobsInfo = '';
    if (thread?.customerId) {
      const jobs = await prisma.job.findMany({
        where: { customerId: thread.customerId, status: { in: ['scheduled', 'in_progress'] } },
        select: { title: true, scheduledStart: true, status: true },
        take: 3,
      });
      if (jobs.length > 0) {
        openJobsInfo = `Open jobs: ${jobs.map(j => `${j.title} (${j.status})`).join(', ')}. `;
      }
    }

    const systemPrompt = `You are writing a short, friendly SMS reply on behalf of Blue Dingo Construction & Remodel, an Arizona general contractor. Sign as "Blue Dingo" or "Kade".

HARD RULES (never break these):
- Never quote prices or give estimates
- Never commit to specific dates or times
- Never promise work will be done
- Never share other customers' information
- Never reveal internal notes or business details
- Keep the message under 320 characters
- Only acknowledge, set expectations, and ask for basic info (address, photos)

Context:
- Customer name: ${customerName}
- ${isReturning ? 'Returning customer' : 'New/unknown contact'}
- ${openJobsInfo}
- Reply type: ${opts.replyType === 'missed_call' ? 'Missed their call' : 'After-hours message'}
- Currently ${inBusinessHours ? 'within' : 'outside'} business hours (M-F 9am-5pm Phoenix time)`;

    const userContent = opts.replyType === 'missed_call'
      ? `Write a brief missed-call auto-reply text. Acknowledge we missed their call and set expectations for callback.`
      : `Write a brief after-hours auto-reply. Let them know our hours and that we'll respond next business day.`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Validation: ensure it doesn't contain forbidden content
    const forbidden = [/\$\d+/, /quote/i, /price/i, /estimate.*\d/i, /guarantee/i, /promise/i];
    if (forbidden.some(re => re.test(text))) {
      logger.warn('[auto-reply] AI reply failed validation, falling back to template');
      return { body: '', aiGenerated: false };
    }

    if (text.length > 320) {
      return { body: '', aiGenerated: false };
    }

    return { body: text, aiGenerated: true };
  } catch (err) {
    logger.warn('[auto-reply] AI generation failed, falling back to template', { err });
    return { body: '', aiGenerated: false };
  }
}

export async function shouldAutoReply(opts: {
  tenantId: string;
  phoneNumber: string;
  replyType: 'missed_call' | 'after_hours';
}): Promise<{ shouldReply: boolean; body: string; aiGenerated: boolean; templateFallback: boolean }> {
  // Load device config
  const device = await prisma.phoneBridgeDevice.findFirst({
    where: { tenantId: opts.tenantId, isActive: true },
    select: { config: true },
  });
  const config: AutoReplyConfig = { ...DEFAULT_CONFIG, ...(device?.config as Partial<AutoReplyConfig> ?? {}) };

  // Skip short codes
  if (isShortCode(opts.phoneNumber)) {
    return { shouldReply: false, body: '', aiGenerated: false, templateFallback: false };
  }

  // Skip allowlisted numbers
  if (isAllowlisted(opts.phoneNumber, config.allowlist)) {
    return { shouldReply: false, body: '', aiGenerated: false, templateFallback: false };
  }

  // Check cooldown
  if (await recentAutoReply(opts.phoneNumber, opts.tenantId, config.cooldownHours)) {
    return { shouldReply: false, body: '', aiGenerated: false, templateFallback: false };
  }

  // Determine which template to use based on business hours
  const inHours = isWithinBusinessHours(config.businessHours);

  if (opts.replyType === 'missed_call' && !inHours) {
    // After hours missed call → use after-hours template (don't send both)
    opts.replyType = 'after_hours';
  }

  if (opts.replyType === 'after_hours' && inHours) {
    // During business hours, don't send after-hours reply
    return { shouldReply: false, body: '', aiGenerated: false, templateFallback: false };
  }

  const template = opts.replyType === 'missed_call'
    ? config.missedCallTemplate
    : config.afterHoursTemplate;

  // Try AI-personalized reply
  if (config.useAiReplies) {
    const ai = await generateAiReply({
      tenantId: opts.tenantId,
      phoneNumber: opts.phoneNumber,
      replyType: opts.replyType,
    });
    if (ai.body) {
      return { shouldReply: true, body: ai.body, aiGenerated: true, templateFallback: false };
    }
  }

  // Fall back to template
  return { shouldReply: true, body: template, aiGenerated: false, templateFallback: true };
}

export async function logAutoReply(opts: {
  tenantId: string;
  threadId: string;
  phoneNumber: string;
  replyType: string;
  body: string;
  aiGenerated: boolean;
  templateFallback: boolean;
}) {
  await prisma.phoneAutoReplyLog.create({
    data: {
      tenantId: opts.tenantId,
      threadId: opts.threadId,
      phoneNumber: opts.phoneNumber,
      replyType: opts.replyType,
      body: opts.body,
      aiGenerated: opts.aiGenerated,
      templateFallback: opts.templateFallback,
    },
  });

  // Also store as outbound message in the thread
  await prisma.phoneMessage.create({
    data: {
      tenantId: opts.tenantId,
      threadId: opts.threadId,
      direction: 'outbound',
      body: opts.body,
      source: 'auto_reply',
      timestamp: new Date(),
    },
  });
}
