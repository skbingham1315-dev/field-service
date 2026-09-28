/**
 * Billing the work-request service fee to the tenant after the visit.
 *
 * One click from the office: the tenant gets an invoice (visible in their
 * portal) and an email with a Square payment link. Nothing is billed
 * automatically — an operator decides the visit happened and clicks.
 *
 * Fee lifecycle this module owns:  assessed/disclosed → invoiced → paid
 * (and back to assessed if the invoice is voided, so it can be re-billed).
 */

import { prisma } from '@fsp/db';
import { WorkRequestFeeStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { EMERGENCY_URGENCY } from './service-fee';
import { generatePayToken, getNextInvoiceNumber } from './invoice-number';
import { createPaymentLink, orderPaid, squarePayEnabled } from './square-pay';
import { sendInvoiceSent, type EmailDeliveryResult } from './email';
import { logger } from './logger';

export interface FeeInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  paymentUrl: string;
  email: EmailDeliveryResult | 'no_email_on_file';
}

export async function invoiceServiceFee(tenantId: string, workRequestId: string): Promise<FeeInvoiceResult> {
  const request = await prisma.portalWorkRequest.findFirst({
    where: { id: workRequestId, tenantId },
    include: {
      portalUser: { include: { pmTenant: true } },
      tenant: { include: { portalConfig: true } },
    },
  });
  if (!request) throw new AppError('Work request not found', 404, 'NOT_FOUND');

  if (request.feeInvoiceId || request.feeStatus === 'invoiced' || request.feeStatus === 'paid') {
    throw new AppError('This fee has already been invoiced', 409, 'ALREADY_INVOICED');
  }
  if (request.status === 'cancelled') {
    throw new AppError('Cancelled requests are not billed', 400, 'INVALID_STATUS');
  }
  if (request.feeAmount == null || Number(request.feeAmount) <= 0) {
    throw new AppError('No service fee was quoted on this request', 400, 'NO_FEE');
  }

  // "assessed" means someone decided the tenant owes it. "disclosed" is enough
  // only when the client charges every non-emergency request regardless of cause.
  const chargesEverything = request.tenant.portalConfig?.serviceFeeWaiveLandlord === false;
  const chargeable =
    request.feeStatus === WorkRequestFeeStatus.assessed ||
    (request.feeStatus === WorkRequestFeeStatus.disclosed &&
      chargesEverything &&
      request.urgency !== EMERGENCY_URGENCY);
  if (!chargeable) {
    throw new AppError(
      `The fee is "${request.feeStatus}" — decide responsibility before invoicing`,
      400,
      'FEE_NOT_CHARGEABLE',
    );
  }

  if (!squarePayEnabled()) {
    throw new AppError('Square is not configured (SQUARE_ACCESS_TOKEN)', 400, 'SQUARE_NOT_CONFIGURED');
  }

  const pu = request.portalUser;
  const firstName = pu.pmTenant?.firstName ?? pu.displayName?.split(' ')[0] ?? 'Resident';
  const lastName = pu.pmTenant?.lastName ?? pu.displayName?.split(' ').slice(1).join(' ') ?? '';
  const email = pu.pmTenant?.email ?? pu.email ?? null;
  const amountCents = Math.round(Number(request.feeAmount) * 100);
  const visitDate = request.createdAt.toLocaleDateString('en-US', { timeZone: 'America/Phoenix' });
  const lineDescription = `Service request fee — ${request.title} (requested ${visitDate})`;

  // Created before the invoice and keyed on the request, so a retry after a
  // failure further down reuses the same link rather than minting another.
  const link = await createPaymentLink({
    idempotencyKey: `fee-${request.id}`,
    name: `Service request fee — ${request.title}`.slice(0, 255),
    amountCents,
    note: `${request.tenant.name} · work request ${request.id}`,
    buyerEmail: email,
  });

  const invoiceNumber = await getNextInvoiceNumber(tenantId);
  const now = new Date();

  const invoice = await prisma.$transaction(async (tx) => {
    let customerId = pu.customerId;
    if (!customerId) {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          firstName,
          lastName,
          email,
          phone: pu.pmTenant?.phone ?? null,
          tags: ['rental-tenant'],
          notes: 'Created automatically to bill work-request service fees.',
        },
      });
      customerId = customer.id;
      await tx.portalUser.update({ where: { id: pu.id }, data: { customerId } });
    }

    const inv = await tx.invoice.create({
      data: {
        tenantId,
        customerId,
        invoiceNumber,
        status: 'sent',
        issuedAt: now,
        dueDate: now, // due upon receipt, per the acknowledgment the tenant accepted
        subtotal: amountCents,
        taxAmount: 0,
        discountAmount: 0,
        total: amountCents,
        amountDue: amountCents,
        notes:
          'Service request fee per the Service Request Fee Acknowledgment accepted' +
          (request.feeAcknowledgedAt
            ? ` on ${request.feeAcknowledgedAt.toLocaleString('en-US', { timeZone: 'America/Phoenix' })} (Arizona time).`
            : '.'),
        payToken: generatePayToken(),
        squarePaymentLinkId: link.id,
        squarePaymentUrl: link.url,
        squareOrderId: link.orderId,
        lineItems: {
          create: [{ description: lineDescription, quantity: 1, unitPrice: amountCents, total: amountCents, taxable: false }],
        },
      },
    });

    await tx.portalWorkRequest.update({
      where: { id: request.id },
      data: {
        feeStatus: WorkRequestFeeStatus.invoiced,
        feeInvoiceId: inv.id,
        feeDecidedAt: request.feeDecidedAt ?? now,
      },
    });
    return inv;
  });

  let emailResult: FeeInvoiceResult['email'] = 'no_email_on_file';
  if (email) {
    emailResult = await sendInvoiceSent({
      to: email,
      customerName: `${firstName} ${lastName}`.trim(),
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      amountDue: invoice.amountDue,
      companyName: request.tenant.portalConfig?.portalName || request.tenant.name,
      paymentUrl: link.url,
      paymentProvider: 'Square',
      intro: `This invoice is for the service request fee on "${request.title}".`,
    });
  }

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, paymentUrl: link.url, email: emailResult };
}

/**
 * Bring fee statuses in line with their invoices: paid through Square or
 * marked paid by hand → "paid"; voided → back to "assessed" so it can be
 * re-billed. Cheap to call on every list load — it only touches open fees.
 */
export async function syncServiceFeePayments(tenantId: string): Promise<void> {
  const open = await prisma.portalWorkRequest.findMany({
    where: { tenantId, feeStatus: WorkRequestFeeStatus.invoiced, feeInvoiceId: { not: null } },
    include: { feeInvoice: true },
    take: 200,
  });

  for (const r of open) {
    const inv = r.feeInvoice;
    try {
      if (!inv || inv.status === 'void') {
        await prisma.portalWorkRequest.update({
          where: { id: r.id },
          data: { feeStatus: WorkRequestFeeStatus.assessed, feeInvoiceId: null },
        });
        continue;
      }
      if (inv.status === 'paid') {
        await prisma.portalWorkRequest.update({ where: { id: r.id }, data: { feeStatus: WorkRequestFeeStatus.paid } });
        continue;
      }
      if (!inv.squareOrderId) continue;

      const { paid, paidAt } = await orderPaid(inv.squareOrderId);
      if (!paid) continue;

      await prisma.$transaction([
        prisma.payment.create({
          data: {
            tenantId,
            invoiceId: inv.id,
            amount: inv.amountDue,
            method: 'other',
            notes: `Square payment link (order ${inv.squareOrderId})`,
            paidAt: paidAt ?? new Date(),
          },
        }),
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: 'paid', amountPaid: inv.total, amountDue: 0, paidAt: paidAt ?? new Date() },
        }),
        prisma.portalWorkRequest.update({ where: { id: r.id }, data: { feeStatus: WorkRequestFeeStatus.paid } }),
      ]);
    } catch (err) {
      logger.warn('[fee] payment sync failed', { workRequestId: r.id, err: String(err) });
    }
  }
}
