import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const squareRouter = Router();
squareRouter.use(authenticate);
squareRouter.use(requireRole('owner', 'admin'));

// ─── Per-tenant Square token helpers ─────────────────────────────────────────

/** Get the Square access token for the current tenant.
 *  Priority: tenant settings → global env var fallback */
async function getSquareToken(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const token = settings.squareAccessToken as string | undefined;
  if (token) return token;
  // Fallback to global env var (legacy)
  if (process.env.SQUARE_ACCESS_TOKEN) return process.env.SQUARE_ACCESS_TOKEN;
  throw new AppError('Square access token not configured. Add it in Settings → Integrations.', 400, 'SQUARE_NOT_CONFIGURED');
}

function squareBase() {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

async function squareHeaders(tenantId: string) {
  const token = await getSquareToken(tenantId);
  return {
    'Square-Version': '2024-01-17',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function squareGet(path: string, tenantId: string): Promise<any> {
  const headers = await squareHeaders(tenantId);
  const res = await fetch(`${squareBase()}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(`Square API error (${res.status}): ${body}`, 502, 'SQUARE_API_ERROR');
  }
  return res.json();
}

async function squarePost(path: string, body: unknown, tenantId: string): Promise<any> {
  const headers = await squareHeaders(tenantId);
  const res = await fetch(`${squareBase()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Square API error (${res.status}): ${text}`, 502, 'SQUARE_API_ERROR');
  }
  return res.json();
}

async function fetchAllSquareCustomers(tenantId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const url = cursor
      ? `/v2/customers?limit=100&cursor=${encodeURIComponent(cursor)}`
      : '/v2/customers?limit=100';
    const data = await squareGet(url, tenantId);
    if (data.customers) results.push(...data.customers);
    cursor = data.cursor;
  } while (cursor);
  return results;
}

async function batchFetchOrders(orderIds: string[], tenantId: string): Promise<Map<string, any>> {
  const orderMap = new Map<string, any>();
  if (orderIds.length === 0) return orderMap;

  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    try {
      const data = await squarePost('/v2/orders/batch-retrieve', { order_ids: chunk }, tenantId);
      for (const order of data.orders ?? []) {
        orderMap.set(order.id, order);
      }
    } catch {
      // non-critical
    }
  }
  return orderMap;
}

async function fetchAllSquareInvoices(tenantId: string): Promise<any[]> {
  const locData = await squareGet('/v2/locations', tenantId);
  const locationIds: string[] = (locData.locations || []).map((l: any) => l.id);
  if (locationIds.length === 0) return [];

  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { query: { filter: { location_ids: locationIds } }, limit: 100 };
    if (cursor) body.cursor = cursor;
    const data = await squarePost('/v2/invoices/search', body, tenantId);
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
    default: return 'sent';
  }
}

// ─── Token management ────────────────────────────────────────────────────────

// PUT /api/v1/square/token — save Square access token for this tenant
squareRouter.put('/token', async (req, res) => {
  const { accessToken, environment } = req.body as { accessToken: string; environment?: string };
  if (!accessToken?.trim()) {
    throw new AppError('accessToken is required', 400, 'VALIDATION_ERROR');
  }

  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = ((tenant?.settings ?? {}) as Record<string, unknown>);

  settings.squareAccessToken = accessToken.trim();
  if (environment) settings.squareEnvironment = environment;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: settings as any },
  });

  res.json({ success: true, data: { message: 'Square token saved' } } satisfies ApiResponse);
});

// DELETE /api/v1/square/token — remove Square token
squareRouter.delete('/token', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = ((tenant?.settings ?? {}) as Record<string, unknown>);

  delete settings.squareAccessToken;
  delete settings.squareEnvironment;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: settings as any },
  });

  res.json({ success: true, data: { message: 'Square token removed' } } satisfies ApiResponse);
});

// GET /api/v1/square/status — check if Square is connected (without leaking token)
squareRouter.get('/status', async (req, res) => {
  const tenantId = req.user!.tenantId;
  try {
    const token = await getSquareToken(tenantId);
    // Verify token works by fetching locations
    const headers = {
      'Square-Version': '2024-01-17',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const locRes = await fetch(`${squareBase()}/v2/locations`, { headers });
    if (!locRes.ok) {
      res.json({ success: true, data: { connected: false, error: 'Token is invalid or expired' } } satisfies ApiResponse);
      return;
    }
    const locData = await locRes.json() as { locations?: Array<{ business_name?: string }> };
    const locations = locData.locations ?? [];
    const masked = token.slice(0, 8) + '...' + token.slice(-4);
    res.json({
      success: true,
      data: {
        connected: true,
        maskedToken: masked,
        locationCount: locations.length,
        businessName: locations[0]?.business_name ?? null,
      },
    } satisfies ApiResponse);
  } catch {
    res.json({ success: true, data: { connected: false, error: 'No Square token configured' } } satisfies ApiResponse);
  }
});

// ─── Preview ─────────────────────────────────────────────────────────────────

squareRouter.get('/preview', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const [customers, invoices] = await Promise.all([
    fetchAllSquareCustomers(tenantId),
    fetchAllSquareInvoices(tenantId),
  ]);

  res.json({
    data: {
      customers: customers.length,
      invoices: invoices.filter(i => i.status !== 'DRAFT').length,
      estimates: invoices.filter(i => i.status === 'DRAFT').length,
    },
  });
});

// ─── Import ──────────────────────────────────────────────────────────────────

squareRouter.post('/import', async (req, res) => {
  const { importCustomers = true, importInvoices = true, importEstimates = true } = req.body;
  const tenantId = req.user!.tenantId;

  const results = {
    customers: { imported: 0, skipped: 0 },
    invoices: { imported: 0, skipped: 0 },
    estimates: { imported: 0, skipped: 0 },
  };

  const sqCustToLocalId = new Map<string, string>();

  if (importCustomers) {
    const squareCustomers = await fetchAllSquareCustomers(tenantId);

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

  if (importInvoices || importEstimates) {
    const squareInvoices = await fetchAllSquareInvoices(tenantId);

    const orderIds = squareInvoices.map((si) => si.order_id).filter(Boolean);
    const orderMap = await batchFetchOrders(orderIds, tenantId);

    for (const si of squareInvoices) {
      const isDraft = si.status === 'DRAFT';
      if (isDraft && !importEstimates) continue;
      if (!isDraft && !importInvoices) continue;

      let customerId: string | null = null;
      const sqCustId = si.primary_recipient?.customer_id;
      if (sqCustId) {
        customerId = sqCustToLocalId.get(sqCustId) || null;

        if (!customerId) {
          try {
            const custData = await squareGet(`/v2/customers/${sqCustId}`, tenantId);
            const email = custData.customer?.email_address?.toLowerCase();
            if (email) {
              const found = await prisma.customer.findFirst({ where: { tenantId, email } });
              if (found) customerId = found.id;
            }
          } catch {
            // customer lookup failed
          }
        }
      }

      if (!customerId) {
        if (isDraft) results.estimates.skipped++;
        else results.invoices.skipped++;
        continue;
      }

      const prefix = isDraft ? 'EST-SQ-' : 'INV-SQ-';
      const invoiceNumber = si.invoice_number
        ? `${prefix}${si.invoice_number}`
        : `${prefix}${si.id.slice(0, 8).toUpperCase()}`;

      const already = await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber } });

      const order = si.order_id ? orderMap.get(si.order_id) : null;
      const orderLineItems: any[] = order?.line_items ?? [];

      let lineItemsData: Array<{ description: string; quantity: number; unitPrice: number; total: number; taxable: boolean }>;

      if (orderLineItems.length > 0) {
        lineItemsData = orderLineItems.map((li: any) => {
          const unitPrice: number = li.base_price_money?.amount ?? 0;
          const qty: number = parseFloat(li.quantity) || 1;
          const total: number = li.total_money?.amount ?? Math.round(unitPrice * qty);
          const hasTax = (li.applied_taxes?.length ?? 0) > 0 || (li.total_tax_money?.amount ?? 0) > 0;
          const desc = [li.name, li.note].filter(Boolean).join(' — ');
          return { description: desc || 'Service', quantity: qty, unitPrice, total, taxable: hasTax };
        });
      } else {
        const fallbackTotal: number = (si.payment_requests || []).reduce(
          (sum: number, pr: any) =>
            sum + (pr.computed_amount_money?.amount ?? pr.requested_money?.amount ?? 0),
          0,
        );
        lineItemsData = [{
          description: si.title || 'Imported from Square',
          quantity: 1,
          unitPrice: fallbackTotal,
          total: fallbackTotal,
          taxable: false,
        }];
      }

      const subtotalCents: number = order?.total_money?.amount
        ?? lineItemsData.reduce((s, li) => s + li.total, 0);
      const taxCents: number = order?.total_tax_money?.amount ?? 0;
      const discountCents: number = order?.total_discount_money?.amount ?? 0;
      const totalCents: number = subtotalCents;
      const amountPaidCents: number = (si.payment_requests || []).reduce(
        (sum: number, pr: any) => sum + (pr.total_completed_amount_money?.amount ?? 0),
        0,
      );

      const status = mapSquareStatus(si.status);

      const issuedAt = si.created_at ? new Date(si.created_at) : null;
      const dueDate = si.payment_requests?.[0]?.due_date
        ? new Date(si.payment_requests[0].due_date)
        : null;
      const paidAt =
        status === 'paid' && si.payment_requests?.[0]?.completed_at
          ? new Date(si.payment_requests[0].completed_at)
          : null;

      const notes = [si.title, si.description].filter(Boolean).join('\n') || null;

      const invoiceFields = {
        status: status as any,
        subtotal: subtotalCents - taxCents,
        taxAmount: taxCents,
        discountAmount: discountCents,
        total: totalCents,
        amountPaid: amountPaidCents,
        amountDue: totalCents - amountPaidCents,
        dueDate,
        issuedAt,
        paidAt,
        notes,
      };

      if (already) {
        await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: already.id } });
        await prisma.invoice.update({
          where: { id: already.id },
          data: { ...invoiceFields, lineItems: { create: lineItemsData } },
        });
        if (isDraft) results.estimates.skipped++;
        else results.invoices.skipped++;
      } else {
        await prisma.invoice.create({
          data: {
            tenantId,
            customerId,
            invoiceNumber,
            ...invoiceFields,
            lineItems: { create: lineItemsData },
          },
        });
        if (isDraft) results.estimates.imported++;
        else results.invoices.imported++;
      }
    }
  }

  res.json({ data: results });
});
