import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import Stripe from 'stripe';
import type { ApiResponse } from '@fsp/types';
import { sendInvoiceSent, sendPaymentReceived } from '../lib/email';
import { sendSms } from '../lib/sms';
import crypto from 'crypto';

function generatePayToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

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
  const last = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: 'INV-' } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNum = last ? parseInt(last.invoiceNumber.replace('INV-', ''), 10) : 0;
  return `INV-${String(lastNum + 1).padStart(5, '0')}`;
}

const invoiceInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  lineItems: true,
  payments: { orderBy: { paidAt: 'desc' as const } },
};

// GET /api/v1/invoices/stats — dashboard totals across all invoices
invoicesRouter.get('/stats', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const [outstanding, overdue, paid, all] = await Promise.all([
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: ['sent', 'viewed'] }, invoiceNumber: { startsWith: 'INV-' } },
      _sum: { amountDue: true },
      _count: { id: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId, status: 'sent', dueDate: { lt: new Date() }, amountDue: { gt: 0 }, invoiceNumber: { startsWith: 'INV-' } },
      _sum: { amountDue: true },
      _count: { id: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId, status: 'paid', invoiceNumber: { startsWith: 'INV-' } },
      _sum: { amountPaid: true },
      _count: { id: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId, status: { not: 'void' }, invoiceNumber: { startsWith: 'INV-' } },
      _sum: { total: true },
      _count: { id: true },
    }),
  ]);
  res.json({
    success: true,
    data: {
      outstanding: { total: outstanding._sum.amountDue ?? 0, count: outstanding._count.id },
      overdue: { total: overdue._sum.amountDue ?? 0, count: overdue._count.id },
      paid: { total: paid._sum.amountPaid ?? 0, count: paid._count.id },
      all: { total: all._sum.total ?? 0, count: all._count.id },
    },
  } satisfies ApiResponse);
});

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

  // Auto-generate payToken if missing
  if (!invoice.payToken) {
    const token = generatePayToken();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { payToken: token } });
    (invoice as any).payToken = token;
  }

  res.json({ success: true, data: invoice } satisfies ApiResponse);
});

// POST /api/v1/invoices
invoicesRouter.post('/', async (req, res) => {
  const { customerId, jobId, lineItems, dueDate, notes, discountAmount = 0, downPaymentAmount, downPaymentDueDate } = req.body;

  if (!customerId || !lineItems?.length) {
    throw new AppError('customerId and lineItems are required', 400, 'VALIDATION_ERROR');
  }

  // Validate customer belongs to this tenant
  const customerRecord = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customerRecord || customerRecord.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  // Validate line items
  for (const item of lineItems) {
    if (!item.description || !String(item.description).trim()) {
      throw new AppError('Line item description is required', 400, 'VALIDATION_ERROR');
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new AppError('Line item quantity must be positive', 400, 'VALIDATION_ERROR');
    }
    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0 || item.unitPrice > 99999999) {
      throw new AppError('Line item unit price must be non-negative and reasonable', 400, 'VALIDATION_ERROR');
    }
  }

  // Validate notes length
  if (notes && String(notes).length > 5000) {
    throw new AppError('Notes must be under 5000 characters', 400, 'VALIDATION_ERROR');
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
  const discount = Math.max(0, parseInt(discountAmount) || 0);
  if (discount > subtotal + taxAmount) {
    throw new AppError('Discount cannot exceed invoice total', 400, 'VALIDATION_ERROR');
  }
  const total = subtotal + taxAmount - discount;

  // Validate down payment
  if (downPaymentAmount != null) {
    const dp = Math.round(Number(downPaymentAmount));
    if (dp < 0 || dp > total) {
      throw new AppError('Down payment must be between $0 and the invoice total', 400, 'VALIDATION_ERROR');
    }
  }

  const invoiceNumber = await getNextInvoiceNumber(req.user!.tenantId);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId,
      ...(jobId ? { jobId } : {}),
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
      payToken: generatePayToken(),
      ...(downPaymentAmount != null ? { downPaymentAmount: Math.round(Number(downPaymentAmount)) } : {}),
      ...(downPaymentDueDate ? { downPaymentDueDate: new Date(downPaymentDueDate) } : {}),
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
  if (['paid', 'void'].includes(existing.status)) {
    throw new AppError('Paid and voided invoices cannot be edited', 400, 'INVALID_STATUS');
  }

  const { lineItems, dueDate, notes, discountAmount, jobId: bodyJobId } = req.body;

  // Recalculate if line items changed
  let updateData: Record<string, unknown> = {
    notes,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    ...(bodyJobId !== undefined ? { jobId: bodyJobId || null } : {}),
  };

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

    updateData = {
      ...updateData,
      subtotal,
      taxAmount,
      discountAmount: discount,
      total,
      amountDue: total - existing.amountPaid,
    };

    // Replace line items + update invoice atomically
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: req.params.id } });
      await tx.invoiceLineItem.createMany({
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
      return tx.invoice.update({
        where: { id: req.params.id },
        data: updateData,
        include: invoiceInclude,
      });
    });

    return res.json({ success: true, data: invoice } satisfies ApiResponse);
  }

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: updateData,
    include: invoiceInclude,
  });

  res.json({ success: true, data: invoice } satisfies ApiResponse);
});

// POST /api/v1/invoices/:id/send  — mark as sent (owner/admin/dispatcher/sales only)
invoicesRouter.post('/:id/send', requireRole('owner', 'admin', 'dispatcher', 'sales'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    select: { id: true, tenantId: true, customerId: true, status: true, invoiceNumber: true, total: true, amountDue: true, dueDate: true, issuedAt: true, payToken: true },
  });
  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (invoice.status === 'void' || invoice.status === 'paid') {
    throw new AppError(`Cannot send a ${invoice.status} invoice`, 400, 'INVALID_STATUS');
  }

  // Ensure a payToken exists (back-fill if missing)
  let payToken = invoice.payToken;
  if (!payToken) {
    payToken = generatePayToken();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { payToken } });
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: 'sent', issuedAt: invoice.issuedAt ?? new Date() },
    include: invoiceInclude,
  });

  res.json({ success: true, data: { ...updated, payToken } } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
      const tenant = await prisma.tenant.findUnique({ where: { id: updated.tenantId } });
      if (!customer || !tenant) return;
      const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
      const payUrl = `${webUrl}/pay/${payToken}`;
      if (customer.email) {
        await sendInvoiceSent({
          to: customer.email,
          customerName: `${customer.firstName} ${customer.lastName}`,
          invoiceNumber: updated.invoiceNumber,
          total: updated.total,
          amountDue: updated.amountDue,
          companyName: tenant.name,
          dueDate: updated.dueDate?.toISOString(),
          paymentUrl: payUrl,
        });
      }
      if (customer.phone) {
        const body = `Hi ${customer.firstName}! Invoice ${updated.invoiceNumber} for $${(updated.total / 100).toFixed(2)} from ${tenant.name} is ready. Amount due: $${(updated.amountDue / 100).toFixed(2)}. Pay here: ${payUrl}`;
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
  if (paymentAmount <= 0) {
    throw new AppError('Payment amount must be positive', 400, 'VALIDATION_ERROR');
  }
  if (paymentAmount > invoice.amountDue) {
    throw new AppError(`Payment amount ($${(paymentAmount / 100).toFixed(2)}) exceeds amount due ($${(invoice.amountDue / 100).toFixed(2)})`, 400, 'VALIDATION_ERROR');
  }
  const paymentDate = paidAt ? new Date(paidAt) : new Date();
  if (paymentDate > new Date(Date.now() + 86400000)) {
    throw new AppError('Payment date cannot be in the future', 400, 'VALIDATION_ERROR');
  }

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
      const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
      const payUrl = updatedInvoice.payToken ? `${webUrl}/pay/${updatedInvoice.payToken}` : undefined;
      if (customer.email) {
        await sendPaymentReceived({
          to: customer.email,
          customerName: `${customer.firstName} ${customer.lastName}`,
          invoiceNumber: updatedInvoice.invoiceNumber,
          amountPaid: payment.amount,
          amountDue: updatedInvoice.amountDue,
          companyName: tenant.name,
          paymentUrl: updatedInvoice.amountDue > 0 ? payUrl : undefined,
        });
      }
      if (customer.phone) {
        const remaining = updatedInvoice.amountDue;
        const payLink = remaining > 0 && payUrl ? ` Pay here: ${payUrl}` : '';
        const body = `Hi ${customer.firstName}! We received your payment of $${(payment.amount / 100).toFixed(2)} for invoice ${updatedInvoice.invoiceNumber}. Balance: $${(remaining / 100).toFixed(2)}.${payLink} Thank you!`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});

// POST /api/v1/invoices/:id/duplicate — clone invoice as new draft
invoicesRouter.post('/:id/duplicate', requireRole('owner', 'admin', 'dispatcher', 'sales'), async (req, res) => {
  const original = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lineItems: true },
  });
  if (!original || original.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }

  const invoiceNumber = await getNextInvoiceNumber(req.user!.tenantId);

  const duplicate = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId: original.customerId,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: original.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          total: li.total,
          taxable: li.taxable,
        })),
      },
      subtotal: original.subtotal,
      taxAmount: original.taxAmount,
      discountAmount: original.discountAmount,
      total: original.total,
      amountDue: original.total,
      notes: original.notes,
      payToken: generatePayToken(),
      downPaymentAmount: original.downPaymentAmount,
    },
    include: invoiceInclude,
  });

  res.status(201).json({ success: true, data: duplicate } satisfies ApiResponse);
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

// DELETE /api/v1/invoices/:id — owner/admin only, hard delete
invoicesRouter.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.tenantId !== req.user!.tenantId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: req.params.id } });
  await prisma.payment.deleteMany({ where: { invoiceId: req.params.id } });
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { message: 'Invoice deleted' } } satisfies ApiResponse);
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

// POST /api/v1/invoices/wipe-all — owner only, one-time cleanup
invoicesRouter.post('/wipe-all', requireRole('owner'), async (req, res) => {
  const tenantId = req.user!.tenantId;
  const d1 = await prisma.invoiceLineItem.deleteMany({ where: { invoice: { tenantId } } });
  const d2 = await prisma.payment.deleteMany({ where: { tenantId } });
  const d3 = await prisma.invoice.deleteMany({ where: { tenantId } });
  res.json({
    success: true,
    data: { lineItems: d1.count, payments: d2.count, invoices: d3.count },
  } satisfies ApiResponse);
});
