import { prisma } from '@fsp/db';
import { logger } from './logger';

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || accountSid === 'ACplaceholder') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('twilio')(accountSid, authToken);
}

export async function sendSms(opts: {
  tenantId: string;
  customerId: string;
  to: string;
  body: string;
  from?: string;
}): Promise<{ simulated?: boolean; sid?: string; status?: string }> {
  const fromNumber = opts.from ?? process.env.TWILIO_PHONE_NUMBER ?? '';
  const twilio = getTwilioClient();

  if (!twilio) {
    logger.info(`[sms] simulated: to=${opts.to} body=${opts.body}`);
    try {
      await prisma.smsMessage.create({
        data: {
          tenantId: opts.tenantId,
          customerId: opts.customerId,
          direction: 'outbound',
          from: fromNumber,
          to: opts.to,
          body: opts.body,
          status: 'simulated',
        },
      });
    } catch (err) {
      logger.warn('[sms] failed to save simulated SMS record', { err });
    }
    return { simulated: true };
  }

  try {
    const result = await twilio.messages.create({
      body: opts.body,
      from: fromNumber,
      to: opts.to,
    });

    await prisma.smsMessage.create({
      data: {
        tenantId: opts.tenantId,
        customerId: opts.customerId,
        direction: 'outbound',
        from: fromNumber,
        to: opts.to,
        body: opts.body,
        twilioSid: result.sid,
        status: result.status,
      },
    });

    return { sid: result.sid, status: result.status };
  } catch (err) {
    logger.warn('[sms] failed to send SMS', { to: opts.to, err });
    try {
      await prisma.smsMessage.create({
        data: {
          tenantId: opts.tenantId,
          customerId: opts.customerId,
          direction: 'outbound',
          from: fromNumber,
          to: opts.to,
          body: opts.body,
          status: 'failed',
        },
      });
    } catch (dbErr) {
      logger.warn('[sms] failed to save failed SMS record', { dbErr });
    }
    return { status: 'failed' };
  }
}

export async function saveInboundSms(opts: {
  tenantId: string;
  customerId: string;
  from: string;
  to: string;
  body: string;
  twilioSid: string;
}): Promise<void> {
  try {
    await prisma.smsMessage.create({
      data: {
        tenantId: opts.tenantId,
        customerId: opts.customerId,
        direction: 'inbound',
        from: opts.from,
        to: opts.to,
        body: opts.body,
        twilioSid: opts.twilioSid,
        status: 'received',
      },
    });
  } catch (err) {
    logger.warn('[sms] failed to save inbound SMS record', { err });
  }
}
