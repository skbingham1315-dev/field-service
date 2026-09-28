/**
 * End-to-end check of billing the service fee after a visit, against the running
 * local API with Square replaced by an in-process stub (no real Square calls).
 *
 * Start the API with the stub pointed at this script's port:
 *   SQUARE_API_BASE=http://localhost:4010 SQUARE_ACCESS_TOKEN=stub npm run dev   (apps/api)
 * then:
 *   node packages/db/scripts/e2e-fee-invoice.cjs
 *
 * Mints its own tokens rather than logging in, so no password is handled here.
 */
const http = require('http');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const API = 'http://localhost:3001/api/v1';
const JWT_SECRET = process.env.JWT_SECRET;
const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET || JWT_SECRET + '_portal';
const p = new PrismaClient();

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' -- ' + detail : '')); }
}

// ─── Square stub ─────────────────────────────────────────────────────────────
const links = new Map(); // idempotency_key -> link
const orders = new Map(); // order id -> { paid }
let linkCalls = 0;
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v2/locations') {
      return res.end(JSON.stringify({ locations: [{ id: 'LOC1', status: 'ACTIVE' }] }));
    }
    if (req.url === '/v2/online-checkout/payment-links' && req.method === 'POST') {
      linkCalls++;
      const b = JSON.parse(body);
      if (!links.has(b.idempotency_key)) {
        const n = links.size + 1;
        const link = { id: 'PL' + n, url: 'https://square.link/u/stub' + n, order_id: 'ORD' + n, amount: b.quick_pay.price_money.amount };
        links.set(b.idempotency_key, link);
        orders.set(link.order_id, { paid: false });
      }
      return res.end(JSON.stringify({ payment_link: links.get(b.idempotency_key) }));
    }
    const m = req.url.match(/^\/v2\/orders\/(.+)$/);
    if (m) {
      const o = orders.get(decodeURIComponent(m[1]));
      if (!o) { res.statusCode = 404; return res.end('{}'); }
      return res.end(JSON.stringify({
        order: o.paid
          ? { state: 'COMPLETED', tenders: [{}], net_amount_due_money: { amount: 0 }, closed_at: new Date().toISOString() }
          : { state: 'OPEN', net_amount_due_money: { amount: 5000 } },
      }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
});

async function call(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}

(async () => {
  await new Promise((r) => stub.listen(4010, r));

  const org = await p.tenant.findUnique({ where: { slug: 'brandon-rentals' }, include: { portalConfig: true } });
  const owner = await p.user.findFirst({ where: { tenantId: org.id, role: 'owner' } });
  const adminToken = jwt.sign(
    { sub: owner.id, tenantId: org.id, role: 'owner', email: owner.email, secondaryRoles: [] },
    JWT_SECRET, { expiresIn: '15m' },
  );
  const tenantUser = await p.portalUser.findFirst({ where: { tenantId: org.id, pmTenantId: { not: null } } });
  const originalCustomerId = tenantUser.customerId;
  const portalToken = jwt.sign({ sub: tenantUser.id, tenantId: org.id, type: 'portal' }, PORTAL_SECRET, { expiresIn: '1h' });

  console.log('\nOrg: ' + org.name + ' (waive landlord: ' + org.portalConfig.serviceFeeWaiveLandlord + ')');
  const created = [];
  const mk = async (title, urgency = 'normal') => {
    const r = await call('/portal/work-requests', {
      method: 'POST', token: portalToken, body: { title: 'E2E ' + title, description: 'e2e', urgency, acknowledgedFee: true },
    });
    created.push(r.body.id);
    return r.body;
  };

  console.log('\n1. Invoicing');
  const req1 = await mk('leaky faucet');
  const inv = await call('/portal/admin/work-requests/' + req1.id + '/invoice-fee', { method: 'POST', token: adminToken });
  check('invoice-fee returns 201', inv.status === 201, JSON.stringify(inv.body));
  check('returns a Square pay link', /square\.link/.test(inv.body?.paymentUrl ?? ''));
  check('reports email outcome honestly', ['sent', 'simulated', 'failed', 'no_email_on_file'].includes(inv.body?.email), inv.body?.email);

  const row = await p.portalWorkRequest.findUnique({ where: { id: req1.id }, include: { feeInvoice: { include: { lineItems: true } } } });
  check('fee status -> invoiced', row.feeStatus === 'invoiced', row.feeStatus);
  check('invoice total is $50.00, untaxed', row.feeInvoice?.total === 5000 && row.feeInvoice?.taxAmount === 0, row.feeInvoice?.total);
  check('invoice is sent, due now', row.feeInvoice?.status === 'sent' && !!row.feeInvoice?.dueDate);
  check('line item names the request', /leaky faucet/.test(row.feeInvoice?.lineItems[0]?.description ?? ''));
  check('Square order stored on invoice', !!row.feeInvoice?.squareOrderId);

  const again = await call('/portal/admin/work-requests/' + req1.id + '/invoice-fee', { method: 'POST', token: adminToken });
  check('double invoicing blocked (409)', again.status === 409, again.status);

  console.log('\n2. Tenant sees it');
  const pu = await p.portalUser.findUnique({ where: { id: tenantUser.id } });
  check('portal user linked to a billing customer', !!pu.customerId);
  const tInv = await call('/portal/invoices', { token: portalToken });
  const mine = (tInv.body || []).find((i) => i.id === row.feeInvoiceId);
  check('invoice visible in tenant portal', !!mine);
  check('portal invoice carries Square pay URL', !!mine?.squarePaymentUrl);

  console.log('\n3. Payment sync');
  let list = await call('/portal/admin/work-requests', { token: adminToken });
  check('unpaid order leaves fee invoiced', list.body.find((r) => r.id === req1.id)?.feeStatus === 'invoiced');
  orders.get(row.feeInvoice.squareOrderId).paid = true;
  list = await call('/portal/admin/work-requests', { token: adminToken });
  const synced = list.body.find((r) => r.id === req1.id);
  check('paid Square order -> fee paid', synced?.feeStatus === 'paid', synced?.feeStatus);
  const paidInv = await p.invoice.findUnique({ where: { id: row.feeInvoiceId }, include: { payments: true } });
  check('invoice marked paid, nothing due', paidInv.status === 'paid' && paidInv.amountDue === 0);
  check('payment recorded once', paidInv.payments.length === 1 && paidInv.payments[0].amount === 5000);
  await call('/portal/admin/work-requests', { token: adminToken });
  const paidInv2 = await p.invoice.findUnique({ where: { id: row.feeInvoiceId }, include: { payments: true } });
  check('re-sync does not double-record', paidInv2.payments.length === 1);

  console.log('\n4. Guards');
  const emerg = await mk('gas smell', 'emergency');
  const e = await call('/portal/admin/work-requests/' + emerg.id + '/invoice-fee', { method: 'POST', token: adminToken });
  check('emergency cannot be invoiced', e.status === 400, e.status);

  const req2 = await mk('broken blind');
  await call('/portal/admin/work-requests/' + req2.id + '/invoice-fee', { method: 'POST', token: adminToken });
  const r2 = await p.portalWorkRequest.findUnique({ where: { id: req2.id } });
  await p.invoice.update({ where: { id: r2.feeInvoiceId }, data: { status: 'void' } });
  await call('/portal/admin/work-requests', { token: adminToken });
  const r2b = await p.portalWorkRequest.findUnique({ where: { id: req2.id } });
  check('voided invoice -> fee back to assessed', r2b.feeStatus === 'assessed' && !r2b.feeInvoiceId, r2b.feeStatus);

  const noAuth = await call('/portal/admin/work-requests/' + req2.id + '/invoice-fee', { method: 'POST', token: portalToken });
  check('tenant token cannot invoice', noAuth.status === 401 || noAuth.status === 403, noAuth.status);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const reqs = await p.portalWorkRequest.findMany({ where: { id: { in: created } } });
  const invIds = (await p.invoice.findMany({
    where: { tenantId: org.id, lineItems: { some: { description: { contains: 'E2E ' } } } }, select: { id: true },
  })).map((i) => i.id);
  await p.portalWorkRequest.deleteMany({ where: { id: { in: reqs.map((r) => r.id) } } });
  await p.payment.deleteMany({ where: { invoiceId: { in: invIds } } });
  await p.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invIds } } });
  await p.invoice.deleteMany({ where: { id: { in: invIds } } });
  if (!originalCustomerId) {
    const linked = await p.portalUser.findUnique({ where: { id: tenantUser.id } });
    await p.portalUser.update({ where: { id: tenantUser.id }, data: { customerId: null } });
    if (linked.customerId) await p.customer.delete({ where: { id: linked.customerId } }).catch(() => undefined);
  }
  console.log('\nCleaned up ' + reqs.length + ' requests, ' + invIds.length + ' invoices. Square stub link calls: ' + linkCalls);

  console.log('\n==============================================');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('==============================================');
  stub.close();
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  stub.close();
  await p.$disconnect();
  process.exit(1);
});
