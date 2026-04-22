import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';

export const squareRouter = Router();
squareRouter.use(authenticate);

// ─── Square API helpers ───────────────────────────────────────────────────────

function squareBase() {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

function squareHeaders() {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new AppError('SQUARE_ACCESS_TOKEN is not configured', 400, 'SQUARE_NOT_CONFIGURED');
  return {
    'Square-Version': '2024-01-17',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function squareGet(path: string): Promise<any> {
  const res = await fetch(`${squareBase()}${path}`, { headers: squareHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(`Square API error (${res.status}): ${body}`, 502, 'SQUARE_API_ERROR');
  }
  return res.json();
}

async function squarePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${squareBase()}${path}`, {
    method: 'POST',
    headers: squareHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Square API error (${res.status}): ${text}`, 502, 'SQUARE_API_ERROR');
  }
  return res.json();
}

async function fetchAllSquareCustomers(): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const url = cursor
      ? `/v2/customers?limit=100&cursor=${encodeURIComponent(cursor)}`
      : '/v2/customers?limit=100';
    const data = await squareGet(url);
    if (data.customers) results.push(...data.customers);
    cursor = data.cursor;
  } while (cursor);
  return results;
}

async function fetchAllSquareInvoices(): Promise<any[]> {
  const locData = await squareGet('/v2/locations');
  const locationIds: string[] = (locData.locations || []).map((l: any) => l.id);
  if (locationIds.length === 0) return [];

  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { query: { filter: { location_ids: locationIds } }, limit: 100 };
    if (cursor) body.cursor = cursor;
    const data = await squarePost('/v2/invoices/search', body);
    if (data.invoices) results.push(...data.invoices);
    cursor = data.cursor;
  } while (cursor);
  return results;
}

function mapSquareStatus(squareStatus: string): string {
  switch (squareStatus) {
    case 'PAID': return 'paid';
    case 'CANCELED':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED': return 'void';
    case 'DRAFT': return 'draft';
    default: return 'sent'; // UNPAID, SCHEDULED, PARTIALLY_PAID, PAYMENT_PENDING
  }
}

// ─── Preview ─────────────────────────────────────────────────────────────────

squareRouter.get('/preview', async (req, res) => {
  const [customers, invoices] = await Promise.all([
    fetchAllSquareCustomers(),
    fetchAllSquareInvoices(),
  ]);

  res.json({
    data: {
      customers: customers.length,
      invoices: invoices.filter(i => i.status !== 'DRAFT').length,
      estimates: invoices.filter(i => i.status === 'DRAFT').length,
    },
  });
});

// ─── Import ───────────────────────────────────────────────────────────────────

squareRouter.post('/import', async (req, res) => {
  const { importCustomers = true, importInvoices = true, importEstimates = true } = req.body;
  const tenantId = req.user!.tenantId;

  const results = {
    customers: { imported: 0, skipped: 0 },
    invoices: { imported: 0, skipped: 0 },
    estimates: { imported: 0, skipped: 0 },
  };

  // Map Square customer ID → local customer ID for linking invoices
  const sqCustToLocalId = new Map<string, string>();

  // ── Customers ──────────────────────────────────────────────────────────────
  if (importCustomers) {
    const squareCustomers = await fetchAllSquareCustomers();

    for (const sc of squareCustomers) {
      const email = sc.email_address?.toLowerCase() || null;

      const existing = email
        ? await prisma.customer.findFirst({ where: { tenantId, email } })
        : null;

      if (existing) {
        sqCustToLocalId.set(sc.id, existing.id);
        results.customers.skipped++;
        continue;
      }

      const customer = await prisma.customer.create({
        data: {
          tenantId,
          firstName: sc.given_name || 'Unknown',
          lastName: sc.family_name || '',
          email,
          phone: sc.phone_number || null,
          notes: sc.note || null,
          serviceAddresses: sc.address
            ? {
                create: {
                  street: [sc.address.address_line_1, sc.address.address_line_2]
                    .filter(Boolean)
                    .join(', '),
                  city: sc.address.locality || '',
                  state: sc.address.administrative_district_level_1 || '',
                  zip: sc.address.postal_code || '',
                  country: sc.address.country || 'US',
                  isPrimary: true,
                },
              }
            : undefined,
        },
      });

      sqCustToLocalId.set(sc.id, customer.id);
      results.customers.imported++;
    }
  }

  // ── Invoices & Estimates ───────────────────────────────────────────────────
  if (importInvoices || importEstimates) {
    const squareInvoices = await fetchAllSquareInvoices();

    for (const si of squareInvoices) {
      const isDraft = si.status === 'DRAFT';
      if (isDraft && !importEstimates) continue;
      if (!isDraft && !importInvoices) continue;

      // Resolve local customer
      let customerId: string | null = null;
      const sqCustId = si.primary_recipient?.customer_id;
      if (sqCustId) {
        customerId = sqCustToLocalId.get(sqCustId) || null;

        // If customer wasn't imported this run, look them up by email
        if (!customerId) {
          try {
            const custData = await squareGet(`/v2/customers/${sqCustId}`);
            const email = custData.customer?.email_address?.toLowerCase();
            if (email) {
              const found = await prisma.customer.findFirst({ where: { tenantId, email } });
              if (found) customerId = found.id;
            }
          } catch {
            // customer lookup failed, skip
          }
        }
      }

      if (!customerId) {
        if (isDraft) results.estimates.skipped++;
        else results.invoices.skipped++;
        continue;
      }

      // Calculate amounts from payment_requests (Square stores money in cents)
      const totalCents: number = (si.payment_requests || []).reduce(
        (sum: number, pr: any) =>
          sum + (pr.computed_amount_money?.amount ?? pr.requested_money?.amount ?? 0),
        0,
      );
      const amountPaidCents: number = (si.payment_requests || []).reduce(
        (sum: number, pr: any) => sum + (pr.total_completed_amount_money?.amount ?? 0),
        0,
      );

      // Build invoice number — prefix with SQ to distinguish from native ones
      const prefix = isDraft ? 'EST-SQ-' : 'INV-SQ-';
      const invoiceNumber = si.invoice_number
        ? `${prefix}${si.invoice_number}`
        : `${prefix}${si.id.slice(0, 8).toUpperCase()}`;

      const already = await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber } });
      if (already) {
        if (isDraft) results.estimates.skipped++;
        else results.invoices.skipped++;
        continue;
      }

      const status = mapSquareStatus(si.status);
      const dueDate = si.payment_requests?.[0]?.due_date
        ? new Date(si.payment_requests[0].due_date)
        : null;
      const issuedAt = si.published_at
        ? new Date(si.published_at)
        : si.created_at
          ? new Date(si.created_at)
          : null;
      const paidAt =
        status === 'paid' && si.payment_requests?.[0]?.completed_at
          ? new Date(si.payment_requests[0].completed_at)
          : null;

      await prisma.invoice.create({
        data: {
          tenantId,
          customerId,
          invoiceNumber,
          status: status as any,
          subtotal: totalCents,
          taxAmount: 0,
          discountAmount: 0,
          total: totalCents,
          amountPaid: amountPaidCents,
          amountDue: totalCents - amountPaidCents,
          dueDate,
          issuedAt,
          paidAt,
          notes: si.description || null,
          lineItems: {
            create: {
              description: si.title || 'Imported from Square',
              quantity: 1,
              unitPrice: totalCents,
              total: totalCents,
              taxable: false,
            },
          },
        },
      });

      if (isDraft) results.estimates.imported++;
      else results.invoices.imported++;
    }
  }

  res.json({ data: results });
});
