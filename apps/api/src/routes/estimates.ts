import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';
import { sendEstimateCreated, sendEstimateConverted } from '../lib/email';
import { sendSms } from '../lib/sms';

export const estimatesRouter = Router();

estimatesRouter.use(authenticate);

const estimateInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  lineItems: true,
};

async function getNextEstimateNumber(tenantId: string): Promise<string> {
  const count = await prisma.invoice.count({
    where: { tenantId, invoiceNumber: { startsWith: 'EST-' } },
  });
  return `EST-${String(count + 1).padStart(5, '0')}`;
}

async function getNextInvoiceNumber(tenantId: string): Promise<string> {
  const count = await prisma.invoice.count({
    where: { tenantId, invoiceNumber: { startsWith: 'INV-' } },
  });
  return `INV-${String(count + 1).padStart(5, '0')}`;
}

// GET /api/v1/estimates
estimatesRouter.get('/', async (req, res) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    invoiceNumber: { startsWith: 'EST-' },
  };

  if (status) where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { firstName: { contains: search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [estimates, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: estimateInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({
    success: true,
    data: estimates,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  } satisfies ApiResponse);
});

// GET /api/v1/estimates/:id
estimatesRouter.get('/:id', async (req, res) => {
  const estimate = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: estimateInclude,
  });

  if (
    !estimate ||
    estimate.tenantId !== req.user!.tenantId ||
    !estimate.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data: estimate } satisfies ApiResponse);
});

// POST /api/v1/estimates
estimatesRouter.post('/', async (req, res) => {
  const { customerId, lineItems, notes, dueDate } = req.body as {
    customerId: string;
    lineItems: { description: string; quantity: number; unitPrice: number; taxable?: boolean }[];
    notes?: string;
    dueDate?: string;
  };

  if (!customerId || !lineItems?.length) {
    throw new AppError('customerId and lineItems are required', 400, 'VALIDATION_ERROR');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
  const taxRate = Number(tenant.taxRate);

  const subtotal: number = lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0,
  );
  const taxableSubtotal: number = lineItems
    .filter((i) => i.taxable !== false)
    .reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
  const taxAmount = Math.round(taxableSubtotal * taxRate);
  const total = subtotal + taxAmount;

  const invoiceNumber = await getNextEstimateNumber(req.user!.tenantId);

  const estimate = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice),
          total: Math.round(item.quantity * item.unitPrice),
          taxable: item.taxable !== false,
        })),
      },
      subtotal,
      taxAmount,
      discountAmount: 0,
      total,
      amountDue: total,
      notes,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
    include: estimateInclude,
  });

  res.status(201).json({ success: true, data: estimate } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: estimate.customerId } });
      const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
      if (!customer || !tenant) return;
      const opts = {
        customerName: `${customer.firstName} ${customer.lastName}`,
        estimateNumber: estimate.invoiceNumber,
        total: estimate.total,
        companyName: tenant.name,
        dueDate: estimate.dueDate?.toISOString(),
      };
      if (customer.email) {
        await sendEstimateCreated({ to: customer.email, ...opts });
      }
      if (customer.phone) {
        const body = `Hi ${customer.firstName}! ${tenant.name} has sent you estimate ${estimate.invoiceNumber} for $${(estimate.total / 100).toFixed(2)}. We'll be in touch!`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});

// PATCH /api/v1/estimates/:id
estimatesRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });

  if (
    !existing ||
    existing.tenantId !== req.user!.tenantId ||
    !existing.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }
  // Allow status-only updates (e.g. send or void) outside draft-only check
  const { status: statusOnly } = req.body as { status?: string };
  if (statusOnly && Object.keys(req.body).length === 1) {
    const allowed = ['sent', 'void', 'accepted', 'rejected'];
    if (!allowed.includes(statusOnly)) {
      throw new AppError('Invalid status', 400, 'INVALID_STATUS');
    }
    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: statusOnly as never },
      include: estimateInclude,
    });
    return res.json({ success: true, data: updated } satisfies ApiResponse);
  }

  if (existing.status !== 'draft') {
    throw new AppError('Only draft estimates can be edited', 400, 'INVALID_STATUS');
  }

  const { lineItems, notes, dueDate, discountAmount } = req.body as {
    lineItems?: { description: string; quantity: number; unitPrice: number; taxable?: boolean }[];
    notes?: string;
    dueDate?: string;
    discountAmount?: number;
  };

  let updateData: Record<string, unknown> = {
    notes,
    dueDate: dueDate ? new Date(dueDate) : undefined,
  };

  if (lineItems) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const taxRate = Number(tenant.taxRate);

    const subtotal: number = lineItems.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
      0,
    );
    const taxableSubtotal: number = lineItems
      .filter((i) => i.taxable !== false)
      .reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
    const taxAmount = Math.round(taxableSubtotal * taxRate);
    const discount = discountAmount !== undefined ? discountAmount : existing.discountAmount;
    const total = subtotal + taxAmount - discount;

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
      data: lineItems.map((item) => ({
        invoiceId: req.params.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice),
        total: Math.round(item.quantity * item.unitPrice),
        taxable: item.taxable !== false,
      })),
    });
  } else if (discountAmount !== undefined) {
    const discount = discountAmount;
    const total = existing.subtotal + existing.taxAmount - discount;
    updateData = {
      ...updateData,
      discountAmount: discount,
      total,
      amountDue: total - existing.amountPaid,
    };
  }

  const estimate = await prisma.invoice.update({
    where: { id: req.params.id },
    data: updateData,
    include: estimateInclude,
  });

  res.json({ success: true, data: estimate } satisfies ApiResponse);
});

// POST /api/v1/estimates/:id/convert — convert estimate to invoice
estimatesRouter.post('/:id/convert', async (req, res) => {
  const estimate = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lineItems: true },
  });

  if (
    !estimate ||
    estimate.tenantId !== req.user!.tenantId ||
    !estimate.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });

  const invoiceNumber = await getNextInvoiceNumber(req.user!.tenantId);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId: estimate.customerId,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: estimate.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          taxable: item.taxable,
        })),
      },
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      discountAmount: estimate.discountAmount,
      total: estimate.total,
      amountDue: estimate.total,
      notes: estimate.notes,
      dueDate: estimate.dueDate,
    },
    select: { id: true, invoiceNumber: true },
  });

  res.status(201).json({
    success: true,
    data: {
      estimateId: estimate.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
  } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: estimate.customerId } });
      if (!customer) return;
      const opts = {
        customerName: `${customer.firstName} ${customer.lastName}`,
        estimateNumber: estimate.invoiceNumber,
        invoiceNumber: invoice.invoiceNumber,
        total: estimate.total,
        companyName: tenant.name,
        dueDate: estimate.dueDate?.toISOString(),
      };
      if (customer.email) {
        await sendEstimateConverted({ to: customer.email, ...opts });
      }
      if (customer.phone) {
        const body = `Hi ${customer.firstName}! ${tenant.name} has converted estimate ${estimate.invoiceNumber} to invoice ${invoice.invoiceNumber} for $${(estimate.total / 100).toFixed(2)}.`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});
