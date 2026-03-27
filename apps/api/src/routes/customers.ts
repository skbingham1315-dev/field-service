import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';
import { sendSms } from '../lib/sms';
import { geocodeAndSave } from '../lib/geocode';

export const customersRouter = Router();

customersRouter.use(authenticate);

const customerInclude = {
  serviceAddresses: { orderBy: { isPrimary: 'desc' as const } },
};

// ── List ──────────────────────────────────────────────────────────────────────

customersRouter.get('/', async (req, res) => {
  const { search, status, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: customerInclude,
      orderBy: { lastName: 'asc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({
    success: true,
    data: customers,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// ── Get one (with job + invoice history) ─────────────────────────────────────

customersRouter.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      ...customerInclude,
      jobs: {
        orderBy: { scheduledStart: 'desc' },
        take: 20,
        include: {
          technician: { select: { id: true, firstName: true, lastName: true } },
          serviceAddress: { select: { street: true, city: true } },
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, amountDue: true, dueDate: true, createdAt: true,
        },
      },
    },
  });

  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data: customer } satisfies ApiResponse);
});

// ── Create ────────────────────────────────────────────────────────────────────

customersRouter.post('/', async (req, res) => {
  const { firstName, lastName, email, phone, notes, tags, status, serviceAddresses } = req.body;

  if (!firstName || !lastName) {
    throw new AppError('firstName and lastName are required', 400, 'VALIDATION_ERROR');
  }

  const customer = await prisma.customer.create({
    data: {
      tenantId: req.user!.tenantId,
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
      tags: tags ?? [],
      status: status ?? 'active',
      serviceAddresses: serviceAddresses?.length
        ? { create: serviceAddresses }
        : undefined,
    },
    include: customerInclude,
  });

  res.status(201).json({ success: true, data: customer } satisfies ApiResponse);
});

// ── Update ────────────────────────────────────────────────────────────────────

customersRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  const { firstName, lastName, email, phone, notes, tags, status } = req.body;

  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      firstName, lastName,
      email: email ?? undefined,
      phone: phone ?? undefined,
      notes: notes ?? undefined,
      tags, status,
    },
    include: customerInclude,
  });

  res.json({ success: true, data: customer } satisfies ApiResponse);
});

// ── Delete (soft — set inactive) ──────────────────────────────────────────────

customersRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  await prisma.customer.update({
    where: { id: req.params.id },
    data: { status: 'inactive' },
  });

  res.json({ success: true, data: { message: 'Customer deactivated' } } satisfies ApiResponse);
});

// ── Addresses ─────────────────────────────────────────────────────────────────

customersRouter.post('/:id/addresses', async (req, res) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  const { label, street, city, state, zip, country, accessInstructions, isPrimary } = req.body;

  if (!street || !city || !state || !zip) {
    throw new AppError('street, city, state, zip are required', 400, 'VALIDATION_ERROR');
  }

  // If marking as primary, unset others first
  if (isPrimary) {
    await prisma.serviceAddress.updateMany({
      where: { customerId: req.params.id },
      data: { isPrimary: false },
    });
  }

  const address = await prisma.serviceAddress.create({
    data: {
      customerId: req.params.id,
      label, street, city, state, zip,
      country: country ?? 'US',
      accessInstructions,
      isPrimary: isPrimary ?? false,
    },
  });

  geocodeAndSave(address.id, { street, city, state, zip, country });

  res.status(201).json({ success: true, data: address } satisfies ApiResponse);
});

customersRouter.patch('/:id/addresses/:addressId', async (req, res) => {
  const address = await prisma.serviceAddress.findUnique({ where: { id: req.params.addressId } });
  if (!address || address.customerId !== req.params.id) {
    throw new AppError('Address not found', 404, 'NOT_FOUND');
  }

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Not found', 404, 'NOT_FOUND');
  }

  const { isPrimary } = req.body;
  if (isPrimary) {
    await prisma.serviceAddress.updateMany({
      where: { customerId: req.params.id },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.serviceAddress.update({
    where: { id: req.params.addressId },
    data: req.body,
  });

  // Re-geocode if address fields changed
  const { street: s, city: c, state: st, zip: z, country: co } = { ...address, ...req.body };
  if (s && c && st && z) geocodeAndSave(updated.id, { street: s, city: c, state: st, zip: z, country: co });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

customersRouter.delete('/:id/addresses/:addressId', async (req, res) => {
  const address = await prisma.serviceAddress.findUnique({ where: { id: req.params.addressId } });
  if (!address || address.customerId !== req.params.id) {
    throw new AppError('Address not found', 404, 'NOT_FOUND');
  }

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Not found', 404, 'NOT_FOUND');
  }

  await prisma.serviceAddress.delete({ where: { id: req.params.addressId } });
  res.json({ success: true, data: { message: 'Address deleted' } } satisfies ApiResponse);
});

// ── SMS History ───────────────────────────────────────────────────────────────

customersRouter.get('/:id/sms', async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  const messages = await prisma.smsMessage.findMany({
    where: { customerId: req.params.id, tenantId: req.user!.tenantId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      direction: true,
      from: true,
      to: true,
      body: true,
      status: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: messages } satisfies ApiResponse);
});

// ── Send SMS ──────────────────────────────────────────────────────────────────

customersRouter.post('/:id/sms', async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }
  if (!customer.phone) {
    throw new AppError('Customer has no phone number', 400, 'NO_PHONE');
  }

  const { message } = req.body as { message: string };
  if (!message?.trim()) {
    throw new AppError('message is required', 400, 'VALIDATION_ERROR');
  }

  const result = await sendSms({
    tenantId: customer.tenantId,
    customerId: customer.id,
    to: customer.phone,
    body: message,
  });

  res.json({ success: true, data: result } satisfies ApiResponse);
});
