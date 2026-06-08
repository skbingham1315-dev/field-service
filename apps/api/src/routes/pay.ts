import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const payRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

// GET /api/v1/pay/:token  — public, no auth
payRouter.get('/:token', async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string; invoiceNumber: string; status: string;
    subtotal: number; taxAmount: number; discountAmount: number; total: number;
    amountPaid: number; amountDue: number; dueDate: Date | null; issuedAt: Date | null;
    notes: string | null; tenantId: string; customerId: string;
    downPaymentAmount: number | null; downPaymentDueDate: Date | null;
    stripeCustomerId: string | null;
    customerFirstName: string; customerLastName: string; customerEmail: string | null; customerPhone: string | null;
    tenantName: string;
  }>>(
    `SELECT
       i.id, i."invoiceNumber", i.status,
       i.subtotal, i."taxAmount", i."discountAmount", i.total,
       i."amountPaid", i."amountDue", i."dueDate", i."issuedAt",
       i.notes, i."tenantId", i."customerId",
       i."downPaymentAmount", i."downPaymentDueDate",
       c."stripeCustomerId",
       c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
       c.email AS "customerEmail", c.phone AS "customerPhone",
       t.name AS "tenantName"
     FROM invoices i
     JOIN customers c ON c.id = i."customerId"
     JOIN tenants t ON t.id = i."tenantId"
     WHERE i."payToken" = $1
     LIMIT 1`,
    req.params.token,
  );

  if (!rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  const inv = rows[0];

  if (inv.status === 'void') throw new AppError('This invoice has been voided', 400, 'VOIDED');

  // Fetch line items
  const lineItems = await prisma.invoiceLineItem.findMany({
    where: { invoiceId: inv.id },
    orderBy: { id: 'asc' },
  });

  // Fetch payments
  const payments = await prisma.payment.findMany({
    where: { invoiceId: inv.id },
    orderBy: { paidAt: 'desc' },
  });

  // Determine amountDueNow:
  // If there's an unpaid down payment, that's what's due first.
  // Otherwise it's the full remaining amountDue.
  let amountDueNow = inv.amountDue;
  let downPaymentPending = false;
  if (inv.downPaymentAmount && inv.amountPaid === 0 && inv.amountDue > 0) {
    amountDueNow = Math.min(inv.downPaymentAmount, inv.amountDue);
    downPaymentPending = true;
  }

  // Check for saved payment method on the Stripe customer
  let savedCard: { brand: string; last4: string; paymentMethodId: string } | null = null;
  if (inv.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
    try {
      const pms = await stripe.paymentMethods.list({
        customer: inv.stripeCustomerId,
        type: 'card',
        limit: 1,
      });
      if (pms.data.length > 0) {
        const pm = pms.data[0];
        savedCard = {
          brand: pm.card!.brand,
          last4: pm.card!.last4,
          paymentMethodId: pm.id,
        };
      }
    } catch { /* ignore */ }
  }

  res.json({
    success: true,
    data: {
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        discountAmount: inv.discountAmount,
        total: inv.total,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        amountDueNow,
        downPaymentPending,
        downPaymentAmount: inv.downPaymentAmount,
        downPaymentDueDate: inv.downPaymentDueDate,
        dueDate: inv.dueDate,
        issuedAt: inv.issuedAt,
        notes: inv.notes,
        lineItems,
        payments,
        customer: {
          firstName: inv.customerFirstName,
          lastName: inv.customerLastName,
          email: inv.customerEmail,
        },
        companyName: inv.tenantName,
      },
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      savedCard,
    },
  } satisfies ApiResponse);
});

// POST /api/v1/pay/:token/intent  — create/retrieve PaymentIntent for this payment
payRouter.post('/:token/intent', async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string; invoiceNumber: string; status: string;
    total: number; amountPaid: number; amountDue: number;
    tenantId: string; customerId: string;
    downPaymentAmount: number | null;
    stripeCustomerId: string | null;
    customerEmail: string | null; customerFirstName: string; customerLastName: string;
  }>>(
    `SELECT
       i.id, i."invoiceNumber", i.status,
       i.total, i."amountPaid", i."amountDue",
       i."tenantId", i."customerId",
       i."downPaymentAmount",
       c."stripeCustomerId",
       c.email AS "customerEmail",
       c."firstName" AS "customerFirstName",
       c."lastName" AS "customerLastName"
     FROM invoices i
     JOIN customers c ON c.id = i."customerId"
     WHERE i."payToken" = $1
     LIMIT 1`,
    req.params.token,
  );

  if (!rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  const inv = rows[0];

  if (inv.status === 'void') throw new AppError('This invoice has been voided', 400, 'VOIDED');
  if (inv.amountDue <= 0) throw new AppError('This invoice has no amount due', 400, 'NO_AMOUNT_DUE');

  const { amount } = req.body as { amount?: number };

  // Clamp: must be >= 1 and <= amountDue
  const payAmount = Math.min(Math.max(Math.round(amount ?? inv.amountDue), 1), inv.amountDue);

  // Get or create Stripe customer for saved card support
  let stripeCustomerId = inv.stripeCustomerId;
  if (!stripeCustomerId && inv.customerEmail) {
    try {
      const existing = await stripe.customers.list({ email: inv.customerEmail, limit: 1 });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: inv.customerEmail,
          name: `${inv.customerFirstName} ${inv.customerLastName}`,
          metadata: { customerId: inv.customerId, tenantId: inv.tenantId },
        });
        stripeCustomerId = created.id;
      }
      // Save back to customer record
      await prisma.customer.update({
        where: { id: inv.customerId },
        data: { stripeCustomerId },
      });
    } catch { /* non-critical, proceed without saved card */ }
  }

  const piData: Stripe.PaymentIntentCreateParams = {
    amount: payAmount,
    currency: 'usd',
    setup_future_usage: 'on_session',
    payment_method_types: ['card'],
    metadata: {
      invoiceId: inv.id,
      tenantId: inv.tenantId,
      payAmount: String(payAmount),
    },
  };
  if (stripeCustomerId) piData.customer = stripeCustomerId;

  const paymentIntent = await stripe.paymentIntents.create(piData);

  res.json({
    success: true,
    data: { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id },
  } satisfies ApiResponse);
});
