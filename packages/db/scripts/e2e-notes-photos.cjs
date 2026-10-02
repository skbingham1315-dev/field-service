/**
 * End-to-end check of work-request photos, notes, the staff alert, and the
 * Connect → Test endpoints, against the running local API.
 *
 *   node packages/db/scripts/e2e-notes-photos.cjs
 *
 * Mints its own tokens rather than logging in. Cleans up after itself.
 */
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
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

async function call(path, { method = 'GET', token, body, form } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, body: data, type: ct };
}

// Minimal Square stub for step 5 (API must run with SQUARE_API_BASE=http://localhost:4010).
const stub = require('http').createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v2/locations') return res.end(JSON.stringify({ locations: [{ id: 'L', status: 'ACTIVE' }] }));
  if (req.url.startsWith('/v2/online-checkout')) return res.end(JSON.stringify({ payment_link: { id: 'PL', url: 'https://square.link/u/e2e', order_id: 'O1' } }));
  if (req.url.startsWith('/v2/orders/')) return res.end(JSON.stringify({ order: { state: 'OPEN', net_amount_due_money: { amount: 5000 } } }));
  res.statusCode = 404; res.end('{}');
});

(async () => {
  await new Promise((r) => stub.listen(4010, r));
  const org = await p.tenant.findUnique({ where: { slug: 'brandon-rentals' } });
  const owner = await p.user.findFirst({ where: { tenantId: org.id, role: 'owner' } });
  const admin = jwt.sign({ sub: owner.id, tenantId: org.id, role: 'owner', email: owner.email, secondaryRoles: [] }, JWT_SECRET, { expiresIn: '15m' });
  const [a, b] = await p.portalUser.findMany({ where: { tenantId: org.id, pmTenantId: { not: null }, isTest: false }, take: 2 });
  const tokA = jwt.sign({ sub: a.id, tenantId: org.id, type: 'portal' }, PORTAL_SECRET, { expiresIn: '1h' });
  const tokB = jwt.sign({ sub: b.id, tenantId: org.id, type: 'portal' }, PORTAL_SECRET, { expiresIn: '1h' });
  const createdTestUsers = [];

  console.log('\n1. Request + photos');
  const req = (await call('/portal/work-requests', { method: 'POST', token: tokA, body: { title: 'E2E sink leak', description: 'drip', acknowledgedFee: true } })).body;
  check('request created', !!req.id);
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
  const fd = new FormData();
  fd.append('photo', new Blob([big], { type: 'image/png' }), 'leak.png');
  const up = await call('/portal/work-requests/' + req.id + '/photos', { method: 'POST', token: tokA, form: fd });
  check('photo upload 201', up.status === 201, up.status + ' ' + JSON.stringify(up.body).slice(0, 100));
  const row = await p.portalRequestPhoto.findUnique({ where: { id: up.body.id } });
  const meta = await sharp(Buffer.from(row.data)).metadata();
  check('stored as resized JPEG (≤2000px)', row.mimeType === 'image/jpeg' && Math.max(meta.width, meta.height) <= 2000, row.mimeType + ' ' + meta.width + 'x' + meta.height);
  const got = await call('/portal/work-requests/' + req.id + '/photos/' + up.body.id, { token: tokA });
  check('tenant can view own photo', got.status === 200 && got.type.includes('image/jpeg'));
  const other = await call('/portal/work-requests/' + req.id + '/photos/' + up.body.id, { token: tokB });
  check('another tenant cannot view it', other.status === 404, other.status);
  const staffView = await call('/portal/admin/work-requests/' + req.id + '/photos/' + up.body.id, { token: admin });
  check('staff can view it', staffView.status === 200);
  const fdBad = new FormData();
  fdBad.append('photo', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
  const bad = await call('/portal/work-requests/' + req.id + '/photos', { method: 'POST', token: tokA, form: fdBad });
  check('non-image rejected', bad.status === 400, bad.status);

  console.log('\n2. Notes');
  const n1 = await call('/portal/work-requests/' + req.id + '/notes', { method: 'POST', token: tokA, body: { body: 'Dog is friendly, gate code is on file' } });
  check('tenant note 201', n1.status === 201 && n1.body.fromTenant === true);
  const n2 = await call('/portal/admin/work-requests/' + req.id + '/notes', { method: 'POST', token: admin, body: { body: 'Plumber Tuesday 9-11am' } });
  check('staff note 201', n2.status === 201 && n2.body.fromTenant === false, JSON.stringify(n2.body).slice(0, 120));
  const empty = await call('/portal/work-requests/' + req.id + '/notes', { method: 'POST', token: tokA, body: { body: '   ' } });
  check('empty note rejected', empty.status === 400);
  const foreign = await call('/portal/work-requests/' + req.id + '/notes', { method: 'POST', token: tokB, body: { body: 'hi' } });
  check("can't note someone else's request", foreign.status === 404);
  const list = (await call('/portal/work-requests', { token: tokA })).body.find((r) => r.id === req.id);
  check('tenant list shows 1 photo + 2 notes', list.photos.length === 1 && list.notes.length === 2, JSON.stringify({ p: list.photos.length, n: list.notes.length }));
  check('tenant sees staff reply author', list.notes.some((n) => !n.fromTenant && n.author.length > 0));
  const adminList = (await call('/portal/admin/work-requests', { token: admin })).body.find((r) => r.id === req.id);
  check('admin list shows photos + notes', adminList.photos.length === 1 && adminList.notes.length === 2);

  console.log('\n3. Staff alert');
  await new Promise((r) => setTimeout(r, 500));
  const log = require('fs').readFileSync('C:/Users/koolk/.fsp-prod/api-dev.log', 'utf8');
  check('alert attempted for new request', /work request alert to .*New repair request — E2E sink leak/.test(log));

  console.log('\n4. Test tab');
  const rec = await call('/portal/test/recipients', { token: admin });
  check('recipients = owners/admins', rec.status === 200 && rec.body.recipients.length >= 1 && /\/portal\/brandon-rentals$/.test(rec.body.portalUrl), JSON.stringify(rec.body).slice(0, 140));
  const me = rec.body.recipients[0];
  const s1 = await call('/portal/test/send', { method: 'POST', token: admin, body: { userId: me.id, kind: 'welcome' } });
  check('test welcome send ok', s1.status === 200 && ['sent', 'simulated'].includes(s1.body.result) && !!s1.body.preview?.html, JSON.stringify(s1.body).slice(0, 140));
  const tu = await p.portalUser.findFirst({ where: { tenantId: org.id, email: me.email, isTest: true } });
  if (tu) createdTestUsers.push(tu.id);
  check('hidden test login created', !!tu);
  const users = (await call('/portal/users', { token: admin })).body;
  check('test login hidden from Portal Users', !users.some((u) => u.id === tu?.id));
  const s2 = await call('/portal/test/send', { method: 'POST', token: admin, body: { userId: me.id, kind: 'login' } });
  check('test sign-in link ok, reuses login', s2.status === 200 && (await p.portalUser.count({ where: { tenantId: org.id, email: me.email, isTest: true } })) === 1);
  const sess = await p.portalSession.findFirst({ where: { portalUserId: tu.id }, orderBy: { createdAt: 'desc' } });
  const v = await call('/portal/auth/verify?token=' + sess.token);
  check('test link actually signs in', v.status === 200 && !!v.body.token);
  const outsider = await call('/portal/test/send', { method: 'POST', token: admin, body: { userId: 'not-a-staff-id', kind: 'welcome' } });
  check('cannot send to non-staff', outsider.status === 404);
  const tenantTry = await call('/portal/test/send', { method: 'POST', token: tokA, body: { userId: me.id, kind: 'welcome' } });
  check('tenant token cannot use test endpoints', tenantTry.status === 401 || tenantTry.status === 403, tenantTry.status);

  console.log('\n5. Pay now on billed request');
  const inv = await call('/portal/admin/work-requests/' + req.id + '/invoice-fee', { method: 'POST', token: admin });
  check('invoiced (stub Square)', inv.status === 201, JSON.stringify(inv.body).slice(0, 120));
  const after = (await call('/portal/work-requests', { token: tokA })).body.find((r) => r.id === req.id);
  check('tenant request carries pay link', after.feeStatus === 'invoiced' && !!after.feeInvoice?.squarePaymentUrl);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const r = await p.portalWorkRequest.findUnique({ where: { id: req.id } });
  await p.portalWorkRequest.delete({ where: { id: req.id } });
  if (r.feeInvoiceId) {
    await p.payment.deleteMany({ where: { invoiceId: r.feeInvoiceId } });
    await p.invoiceLineItem.deleteMany({ where: { invoiceId: r.feeInvoiceId } });
    await p.invoice.delete({ where: { id: r.feeInvoiceId } });
  }
  const pa = await p.portalUser.findUnique({ where: { id: a.id } });
  if (!a.customerId && pa.customerId) {
    await p.portalUser.update({ where: { id: a.id }, data: { customerId: null } });
    await p.customer.delete({ where: { id: pa.customerId } }).catch(() => undefined);
  }
  for (const id of createdTestUsers) {
    await p.portalSession.deleteMany({ where: { portalUserId: id } });
    await p.portalUser.delete({ where: { id } });
  }
  console.log('\n==============================================');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('==============================================');
  stub.close();
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
