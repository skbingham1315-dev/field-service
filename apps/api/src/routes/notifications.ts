import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { sendSms } from '../lib/sms';
import type { ApiResponse } from '@fsp/types';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

function isSmsConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_ACCOUNT_SID !== 'ACplaceholder' &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_AUTH_TOKEN !== 'placeholder'
  );
}
function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'placeholder');
}

// GET /api/v1/notifications/status
notificationsRouter.get('/status', async (req, res) => {
  const { role } = req.user!;
  if (!['owner', 'admin'].includes(role)) {
    res.status(403).json({ success: false, message: 'Forbidden' }); return;
  }
  res.json({
    success: true,
    data: {
      sms: {
        configured: isSmsConfigured(),
        phoneNumber: isSmsConfigured() ? (process.env.TWILIO_PHONE_NUMBER ?? null) : null,
      },
      email: {
        configured: isEmailConfigured(),
        from: isEmailConfigured() ? (process.env.EMAIL_FROM ?? null) : null,
      },
    },
  } satisfies ApiResponse);
});

// POST /api/v1/notifications/test  { type: 'sms'|'email', to: string }
notificationsRouter.post('/test', async (req, res) => {
  const { tenantId, role } = req.user!;
  if (!['owner', 'admin'].includes(role)) {
    res.status(403).json({ success: false, message: 'Forbidden' }); return;
  }

  const { type, to } = req.body as { type: 'sms' | 'email'; to: string };
  if (!type || !to) {
    res.status(400).json({ success: false, message: 'type and to are required' }); return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const companyName = tenant?.name ?? 'FieldOps';

  if (type === 'sms') {
    // sendSms needs a customerId; use first customer or a dummy placeholder
    const firstCustomer = await prisma.customer.findFirst({ where: { tenantId } });
    if (!firstCustomer) {
      // still attempt — will log as simulated without a customer
      res.json({ success: true, data: { simulated: true, note: 'Add a customer to enable SMS logging' } } satisfies ApiResponse);
      return;
    }
    const result = await sendSms({
      tenantId,
      customerId: firstCustomer.id,
      to,
      body: `${companyName}: This is a test SMS from FieldOps. SMS notifications are working!`,
    });
    res.json({ success: true, data: result } satisfies ApiResponse);
    return;
  }

  if (type === 'email') {
    if (!isEmailConfigured()) {
      res.json({ success: true, data: { simulated: true, note: 'Add RESEND_API_KEY to enable real email' } } satisfies ApiResponse);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require('resend') as typeof import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const from = process.env.EMAIL_FROM ?? 'FieldOps <noreply@fieldops.app>';
    await resend.emails.send({
      from,
      to: [to],
      subject: `${companyName} — Email notification test`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;margin:0 0 16px">Email Test Successful</h2>
        <p style="color:#374151;line-height:1.6">
          This is a test email from <strong>${companyName}</strong> via FieldOps.<br>
          If you received this, email notifications are working correctly.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:12px">Sent from FieldOps notification system</p>
      </div>`,
    });
    res.json({ success: true, data: { sent: true, to } } satisfies ApiResponse);
    return;
  }

  res.status(400).json({ success: false, message: 'type must be sms or email' });
});

// GET /api/v1/notifications/sms-history
notificationsRouter.get('/sms-history', async (req, res) => {
  const { tenantId, role } = req.user!;
  if (!['owner', 'admin', 'dispatcher'].includes(role)) {
    res.status(403).json({ success: false, message: 'Forbidden' }); return;
  }

  const messages = await prisma.smsMessage.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { customer: { select: { firstName: true, lastName: true } } },
  });

  res.json({ success: true, data: messages } satisfies ApiResponse);
});
