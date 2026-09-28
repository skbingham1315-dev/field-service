/**
 * Collecting a payment through a Square payment link.
 *
 * Deliberately uses the platform's own Square account (SQUARE_ACCESS_TOKEN),
 * not the workspace's: service fees are owed to the maintenance provider that
 * runs FieldOps, whichever client workspace the tenant belongs to.
 *
 * Payment status is read back from the link's order on demand rather than via
 * webhooks, so there is no webhook subscription or signature key to configure.
 */

import { logger } from './logger';

const SQUARE_VERSION = '2024-01-17';

function base(): string {
  // SQUARE_API_BASE lets tests point at a local stub instead of real Square.
  if (process.env.SQUARE_API_BASE) return process.env.SQUARE_API_BASE;
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

export function squarePayEnabled(): boolean {
  return !!process.env.SQUARE_ACCESS_TOKEN;
}

async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN is not set');
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    throw new Error(`Square ${init.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

let cachedLocationId: string | null = null;

async function locationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;
  const data = await call('/v2/locations');
  const loc = (data.locations ?? []).find((l: any) => l.status === 'ACTIVE');
  if (!loc) throw new Error('No active Square location');
  cachedLocationId = loc.id as string;
  return cachedLocationId;
}

export interface PaymentLink {
  id: string;
  url: string;
  orderId: string;
}

/**
 * `idempotencyKey` must be stable for the thing being billed, so a retry after a
 * partial failure returns the same link instead of creating a second one.
 */
export async function createPaymentLink(opts: {
  idempotencyKey: string;
  name: string;
  amountCents: number;
  note?: string;
  buyerEmail?: string | null;
}): Promise<PaymentLink> {
  const data = await call('/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: opts.idempotencyKey,
      quick_pay: {
        name: opts.name,
        price_money: { amount: opts.amountCents, currency: 'USD' },
        location_id: await locationId(),
      },
      ...(opts.note ? { payment_note: opts.note } : {}),
      ...(opts.buyerEmail ? { pre_populated_data: { buyer_email: opts.buyerEmail } } : {}),
    },
  });
  const link = data.payment_link;
  return { id: link.id, url: link.url, orderId: link.order_id };
}

/** Whether the order behind a payment link has been paid in full. */
export async function orderPaid(orderId: string): Promise<{ paid: boolean; paidAt: Date | null }> {
  try {
    const { order } = await call(`/v2/orders/${encodeURIComponent(orderId)}`);
    const due = order?.net_amount_due_money?.amount;
    const paid = order?.state === 'COMPLETED' || (Array.isArray(order?.tenders) && order.tenders.length > 0 && due === 0);
    return { paid, paidAt: paid ? new Date(order.closed_at ?? order.updated_at ?? Date.now()) : null };
  } catch (err) {
    logger.warn('[square] order lookup failed', { orderId, err: String(err) });
    return { paid: false, paidAt: null };
  }
}
