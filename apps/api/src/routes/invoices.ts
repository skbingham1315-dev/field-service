import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import Stripe from 'stripe';
import type { ApiResponse } from '@fsp/types';
import { sendInvoiceSent, sendPaymentReceived } from '../lib/email';
import { sendSms } from '../lib/sms';

export const invoicesRouter = Router();

invoicesRouter.use(authenticate);

// Technicians have no access to invoices
invoicesRouter.use((req, res, next) => {
  if (req.user!.role === 'technician') {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
  next();
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

async function getNextInvoiceNumber(tenantId: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { tenantId } });
  return `INV-${String(count + 1).padStart(5, '0')}`;
}

const invoiceInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  lineItems: true,
  payments: { orderBy: { paidAt: 'desc' as const } },
};

// GET /api/v1/invoices
invoicesRouter.get('/', async (req, res) => {
  const { status, customerId, page = '1', limit = '20', search } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId };
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { firstName: { contains: search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({
    success: true,
    data: invoices,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// GET /api/v1/invoices/:id
invoicesRouter.get('/:id', async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: invoiceInclude,
  });

  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data: invoice } satisfies ApiResponse);
});

// POST /api/v1/invoices
invoicesRouter.post('/', async (req, res) => {
  const { customerId, jobId, lineItems, dueDate, notes, discountAmount = 0 } = req.body;

  if (!customerId || !lineItems?.length) {
    throw new AppError('customerId and lineItems are required', 400, 'VALIDATION_ERROR');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
  const taxRate = Number(tenant.taxRate);

  const subtotal: number = lineItems.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + Math.round(item.quantity * item.unitPrice),
    0,
  );
  const taxableSubtotal: number = lineItems
    .filter((i: { taxable?: boolean }) => i.taxable !== false)
    .reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) =>
        sum + Math.round(item.quantity * item.unitPrice),
      0,
    );
  const taxAmount = Math.round(taxableSubtotal * taxRate);
  const discount = parseInt(discountAmount) || 0;
  const total = subtotal + taxAmount - discount;

  const invoiceNumber = await getNextInvoiceNumber(req.user!.tenantId);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId,
      jobId: jobId || undefined,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: lineItems.map((item: {
          description: string;
          quantity: number;
          unitPrice: number;
          taxable?: boolean;
        }) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice),
          total: Math.round(item.quantity * item.unitPrice),
          taxable: item.taxable !== false,
        })),
      },
      subtotal,
      taxAmount,
      discountAmount: discount,
      total,
      amountDue: total,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
    },
    include: invoiceInclude,
  });

  res.status(201).json({ success: true, data: invoice } satisfies ApiResponse);
});

// PATCH /api/v1/invoices/:id  (only draft invoices)
invoicesRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (existing.status !== 'draft') {
    throw new AppError('Only draft invoices can be edited', 400, 'INVALID_STATUS');
  }

  const { lineItems, dueDate, notes, discountAmount } = req.body;

  // Recalculate if line items changed
  let updateData: Record<string, unknown> = { notes, dueDate: dueDate ? new Date(dueDate) : undefined };

  if (lineItems) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const taxRate = Number(tenant.taxRate);

    const subtotal: number = lineItems.reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) =>
        sum + Math.round(item.quantity * item.unitPrice),
      0,
    );
    const taxableSubtotal: number = lineItems
      .filter((i: { taxable?: boolean }) => i.taxable !== false)
      .reduce(
        (sum: number, item: { quantity: number; unitPrice: number }) =>
          sum + Math.round(item.quantity * item.unitPrice),
        0,
      );
    const taxAmount = Math.round(taxableSubtotal * taxRate);
    const discount = parseInt(discountAmount ?? existing.discountAmount) || 0;
    const total = subtotal + taxAmount - discount;

    // Replace line items
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: req.params.id } });

    updateData = {
      ...updateData,
      subtotal,
      taxAmount,
      discountAmount: discount,
      total,
      amountDue: total - existing.amountPaid,
    };

    await prisma.invoiceLineItem.createMany({
      data: lineItems.map((item: {
        description: string;
        quantity: number;
        unitPrice: number;
        taxable?: boolean;
      }) => ({
        invoiceId: req.params.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice),
        total: Math.round(item.quantity * item.unitPrice),
        taxable: item.taxable !== false,
      })),
    });
  }

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: updateData,
    include: invoiceInclude,
  });

  res.json({ success: true, data: invoice } satisfies ApiResponse);
});

// POST /api/v1/invoices/:id/send  — mark as sent
invoicesRouter.post('/:id/send', async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (invoice.status === 'void' || invoice.status === 'paid') {
    throw new AppError(`Cannot send a ${invoice.status} invoice`, 400, 'INVALID_STATUS');
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: 'sent', issuedAt: invoice.issuedAt ?? new Date() },
    include: invoiceInclude,
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
      const tenant = await prisma.tenant.findUnique({ where: { id: updated.tenantId } });
      if (!customer || !tenant) return;
      if (customer.email) {
        await sendInvoiceSent({
          to: customer.email,
          customerName: `${customer.firstName} ${customer.lastName}`,
          invoiceNumber: updated.invoiceNumber,
          total: updated.total,
          amountDue: updated.amountDue,
          companyName: tenant.name,
          dueDate: updated.dueDate?.toISOString(),
        });
      }
      if (customer.phone) {
        const body = `Hi ${customer.firstName}! Invoice ${updated.invoiceNumber} for $${(updated.total / 100).toFixed(2)} from ${tenant.name} is ready. Amount due: $${(updated.amountDue / 100).toFixed(2)}.`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});

// POST /api/v1/invoices/:id/mark-paid  — owner/admin only
invoicesRouter.post('/:id/mark-paid', requireRole('owner', 'admin'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (invoice.status === 'void') {
    throw new AppError('Cannot mark a void invoice as paid', 400, 'INVALID_STATUS');
  }

  const { amount, method, notes, paidAt } = req.body as {
    amount?: number;
    method: string;
    notes?: string;
    paidAt?: string;
  };

  const paymentAmount = amount ?? invoice.amountDue;
  const paymentDate = paidAt ? new Date(paidAt) : new Date();

  const [payment, updatedInvoice] = await prisma.$transaction(async (tx) => {
    const pmt = await tx.payment.create({
      data: {
        tenantId: req.user!.tenantId,
        invoiceId: invoice.id,
        amount: paymentAmount,
        method: method as never,
        notes,
        paidAt: paymentDate,
      },
    });

    const newAmountPaid = invoice.amountPaid + paymentAmount;
    const newAmountDue = Math.max(0, invoice.total - newAmountPaid);
    const newStatus = newAmountDue === 0 ? 'paid' : 'sent';

    const inv = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        status: newStatus,
        paidAt: newStatus === 'paid' ? paymentDate : undefined,
      },
      include: invoiceInclude,
    });

    return [pmt, inv];
  });

  res.json({ success: true, data: { invoice: updatedInvoice, payment } } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: updatedInvoice.customerId } });
      const tenant = await prisma.tenant.findUnique({ where: { id: updatedInvoice.tenantId } });
      if (!customer || !tenant) return;
      if (customer.email) {
        await sendPaymentReceived({
          to: customer.email,
          customerName: `${customer.firstName} ${customer.lastName}`,
          invoiceNumber: updatedInvoice.invoiceNumber,
          amountPaid: payment.amount,
          amountDue: updatedInvoice.amountDue,
          companyName: tenant.name,
        });
      }
      if (customer.phone) {
        const remaining = updatedInvoice.amountDue;
        const body = `Hi ${customer.firstName}! We received your payment of $${(payment.amount / 100).toFixed(2)} for invoice ${updatedInvoice.invoiceNumber}. Balance: $${(remaining / 100).toFixed(2)}. Thank you!`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});

// POST /api/v1/invoices/:id/void — owner/admin only
invoicesRouter.post('/:id/void', requireRole('owner', 'admin'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (invoice.status === 'paid') {
    throw new AppError('Cannot void a paid invoice', 400, 'INVALID_STATUS');
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: 'void' },
    include: invoiceInclude,
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// POST /api/v1/invoices/:id/payment-intent — Stripe online payment
invoicesRouter.post('/:id/payment-intent', async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { customer: true },
  });

  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (invoice.amountDue <= 0) {
    throw new AppError('Invoice has no amount due', 400, 'NO_AMOUNT_DUE');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: invoice.amountDue,
    currency: 'usd',
    metadata: { invoiceId: invoice.id, tenantId: invoice.tenantId },
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentIntentId: paymentIntent.id },
  });

  res.json({ success: true, data: { clientSecret: paymentIntent.client_secret } } satisfies ApiResponse);
});
