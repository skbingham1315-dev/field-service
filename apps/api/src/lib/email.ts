import { Resend } from 'resend';
import { logger } from './logger';

const FROM = process.env.EMAIL_FROM ?? 'FSP <noreply@yourdomain.com>';
const ENABLED =
  !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'placeholder';
const resend = ENABLED ? new Resend(process.env.RESEND_API_KEY!) : null;

function formatCents(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function baseHtml(companyName: string, title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${companyName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;">This is an automated message from ${companyName}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!ENABLED || !resend) {
    logger.info(`[email] simulated: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to: [to], subject, html });
  } catch (err) {
    logger.warn('[email] failed to send email', { subject, to, err });
  }
}

// ── Job Review Request ────────────────────────────────────────────────────────

export async function sendJobReviewRequest(opts: {
  to: string;
  customerName: string;
  jobTitle: string;
  technicianName?: string;
  reviewUrl: string;
  companyName: string;
}): Promise<void> {
  const subject = `How did we do? Rate your service from ${opts.companyName}`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">How Was Your Service?</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      ${opts.technicianName ? `${opts.technicianName} has` : 'We have'} just completed your <strong>${opts.jobTitle}</strong> service. We'd love to hear how it went!
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${opts.reviewUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
        ⭐ Leave a Review
      </a>
    </div>
    <p style="margin:0;color:#374151;font-size:13px;text-align:center;">Takes less than 30 seconds.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Estimate Created ──────────────────────────────────────────────────────────

export async function sendEstimateCreated(opts: {
  to: string;
  customerName: string;
  estimateNumber: string;
  total: number;
  companyName: string;
  dueDate?: string;
}): Promise<void> {
  const subject = `Estimate ${opts.estimateNumber} from ${opts.companyName}`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Your Estimate is Ready</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      We've prepared an estimate for you. Please find the details below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">ESTIMATE NUMBER</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.estimateNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">TOTAL</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#111827;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">${formatCents(opts.total)}</td>
      </tr>
      ${opts.dueDate ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">VALID UNTIL</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;">${new Date(opts.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
      </tr>` : ''}
    </table>
    <p style="margin:0;color:#374151;">We'll be in touch shortly to go over the details. Please don't hesitate to reach out with any questions.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Estimate Converted ────────────────────────────────────────────────────────

export async function sendEstimateConverted(opts: {
  to: string;
  customerName: string;
  estimateNumber: string;
  invoiceNumber: string;
  total: number;
  companyName: string;
  dueDate?: string;
}): Promise<void> {
  const subject = `Estimate ${opts.estimateNumber} has been converted to Invoice ${opts.invoiceNumber}`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Your Estimate Has Been Approved</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      Great news! Your estimate has been converted to an invoice and work is underway.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">ORIGINAL ESTIMATE</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.estimateNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">INVOICE NUMBER</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">TOTAL</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#111827;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">${formatCents(opts.total)}</td>
      </tr>
      ${opts.dueDate ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">DUE DATE</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;">${new Date(opts.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
      </tr>` : ''}
    </table>
    <p style="margin:0;color:#374151;">Thank you for your business! We look forward to serving you.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Invoice Created ───────────────────────────────────────────────────────────

export async function sendInvoiceCreated(opts: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  companyName: string;
  dueDate?: string;
}): Promise<void> {
  const subject = `Invoice ${opts.invoiceNumber} from ${opts.companyName}`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Invoice Created</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      A new invoice has been created for your account.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">INVOICE NUMBER</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">TOTAL</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#111827;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">${formatCents(opts.total)}</td>
      </tr>
      ${opts.dueDate ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">DUE DATE</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;">${new Date(opts.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
      </tr>` : ''}
    </table>
    <p style="margin:0;color:#374151;">Thank you for choosing ${opts.companyName}.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Invoice Sent ──────────────────────────────────────────────────────────────

export async function sendInvoiceSent(opts: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  companyName: string;
  dueDate?: string;
}): Promise<void> {
  const subject = `Invoice ${opts.invoiceNumber} from ${opts.companyName} — Payment Due`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Invoice Ready for Payment</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      Your invoice from ${opts.companyName} is ready. Please see the payment details below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">INVOICE NUMBER</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">INVOICE TOTAL</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;">${formatCents(opts.total)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">AMOUNT DUE</td>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;color:#2563eb;${opts.dueDate ? 'border-bottom:1px solid #e5e7eb;' : ''}">${formatCents(opts.amountDue)}</td>
      </tr>
      ${opts.dueDate ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">DUE DATE</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;">${new Date(opts.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
      </tr>` : ''}
    </table>
    <p style="margin:0;color:#374151;">Please contact us if you have any questions about this invoice.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Payment Received ──────────────────────────────────────────────────────────

export async function sendPaymentReceived(opts: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amountPaid: number;
  amountDue: number;
  companyName: string;
}): Promise<void> {
  const subject = `Payment received for Invoice ${opts.invoiceNumber} — ${opts.companyName}`;
  const fullyPaid = opts.amountDue === 0;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Payment Received — Thank You!</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.customerName},</p>
    <p style="margin:0 0 24px;color:#374151;">
      We've received your payment. ${fullyPaid ? 'Your invoice is now fully paid.' : 'A remaining balance is due on your account.'}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">INVOICE NUMBER</td>
        <td style="padding:12px 16px;color:#111827;font-size:13px;border-bottom:1px solid #e5e7eb;">${opts.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">PAYMENT AMOUNT</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#16a34a;border-bottom:1px solid #e5e7eb;">${formatCents(opts.amountPaid)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">REMAINING BALANCE</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:${fullyPaid ? '#16a34a' : '#dc2626'};">${fullyPaid ? 'Paid in Full' : formatCents(opts.amountDue)}</td>
      </tr>
    </table>
    <p style="margin:0;color:#374151;">Thank you for your payment and for choosing ${opts.companyName}!</p>`,
  );
  await sendEmail(opts.to, subject, html);
}

// ── Password Reset ────────────────────────────────────────────────────────────

export async function sendPasswordReset(opts: {
  to: string;
  firstName: string;
  resetUrl: string;
  companyName: string;
}): Promise<void> {
  const subject = `Reset your password`;
  const html = baseHtml(
    opts.companyName,
    subject,
    `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Reset Your Password</h2>
    <p style="margin:0 0 24px;color:#374151;">Hi ${opts.firstName},</p>
    <p style="margin:0 0 24px;color:#374151;">We received a request to reset your password. Click the button below — this link expires in 1 hour.</p>
    <p style="margin:0 0 32px;">
      <a href="${opts.resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Reset Password</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>`,
  );
  await sendEmail(opts.to, subject, html);
}
