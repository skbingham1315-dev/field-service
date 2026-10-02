/**
 * Property-management edits + cross-workspace guards, against the running local API.
 * Needs brandon-rentals and one other workspace with an owner.
 *
 *   node packages/db/scripts/e2e-property-guards.cjs
 *
 * Every change it makes is reverted at the end.
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const API = 'http://localhost:3001/api/v1';
const p = new PrismaClient();
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + d : '')); } };
const tok = (u, t) => jwt.sign({ sub: u.id, tenantId: t, role: 'owner', email: u.email, secondaryRoles: [] }, process.env.JWT_SECRET, { expiresIn: '10m' });
async function call(path, token, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}

(async () => {
  const br = await p.tenant.findUnique({ where: { slug: 'brandon-rentals' } });
  // A throwaway outsider workspace, removed at the end.
  const other = await p.tenant.create({ data: { name: 'E2E Outsider', slug: 'e2e-outsider-' + Date.now() } });
  const otherUser = await p.user.create({ data: { tenantId: other.id, email: 'outsider@e2e.test', passwordHash: 'x', firstName: 'Out', lastName: 'Sider', role: 'owner', status: 'active' } });
  const A = tok(await p.user.findFirst({ where: { tenantId: br.id, role: 'owner' } }), br.id);
  const B = tok(otherUser, other.id);
  const lease = await p.lease.findFirst({ where: { status: 'active', unit: { property: { tenantId: br.id } }, occupants: { some: {} } }, include: { unit: true } });
  const pmt = await p.pMTenant.findFirst({ where: { tenantId: br.id } });
  const prop = await p.property.findFirst({ where: { tenantId: br.id } });
  const before = { lease: { ...lease }, pmt: { ...pmt }, prop: { ...prop } };

  console.log('\n1. Own-workspace edits');
  const lu = await call('/properties/leases/unit/' + lease.unitId, A);
  check('lease view includes occupants', lu.status === 200 && Array.isArray(lu.body.occupants) && lu.body.occupants.length > 0);
  const le = await call('/properties/leases/' + lease.id, A, 'PATCH', { rentAmount: 1500, depositAmount: 1500, endDate: '2027-06-30', notes: 'e2e', unitId: 'HACK', pmTenantId: 'HACK' });
  const l2 = await p.lease.findUnique({ where: { id: lease.id } });
  check('lease edit saves rent/deposit/end', le.status === 200 && Number(l2.rentAmount) === 1500 && l2.endDate.toISOString().startsWith('2027-06-30'), le.status);
  check('lease edit ignores unitId/pmTenantId', l2.unitId === lease.unitId && l2.pmTenantId === lease.pmTenantId);
  const te = await call('/properties/pm-tenants/' + pmt.id, A, 'PATCH', { phone: '555-0100', tenantId: other.id });
  const t2 = await p.pMTenant.findUnique({ where: { id: pmt.id } });
  check('renter edit saves', te.status === 200 && t2.phone === '555-0100');
  check('renter edit cannot move workspace', t2.tenantId === br.id);
  const pe = await call('/properties/' + prop.id, A, 'PATCH', { notes: 'Gate: e2e', tenantId: other.id });
  const p2 = await p.property.findUnique({ where: { id: prop.id } });
  check('property edit saves notes', pe.status === 200 && p2.notes === 'Gate: e2e');
  check('property edit cannot move workspace', p2.tenantId === br.id);
  const charge = await call('/properties/ledger', A, 'POST', { leaseId: lease.id, type: 'charge', amount: 10, notes: 'e2e', status: 'pending' });
  check('ledger charge on own lease', charge.status === 201);

  console.log('\n2. Another workspace is locked out');
  check('cannot view lease', (await call('/properties/leases/unit/' + lease.unitId, B)).body == null);
  check('cannot edit lease', (await call('/properties/leases/' + lease.id, B, 'PATCH', { rentAmount: 1 })).status === 404);
  check('cannot read ledger', (await call('/properties/ledger/' + lease.id, B)).status === 404);
  check('cannot add ledger entry', (await call('/properties/ledger', B, 'POST', { leaseId: lease.id, type: 'charge', amount: 1 })).status === 404);
  check('cannot edit ledger entry', (await call('/properties/ledger/' + charge.body.id, B, 'PATCH', { status: 'paid' })).status === 404);
  check('cannot edit renter', (await call('/properties/pm-tenants/' + pmt.id, B, 'PATCH', { phone: 'x' })).status === 404);
  check('cannot create lease on their unit', (await call('/properties/leases', B, 'POST', { unitId: lease.unitId, pmTenantId: pmt.id, startDate: '2026-01-01', rentAmount: 1 })).status === 404);
  const forged = await call('/properties/pm-tenants', B, 'POST', { firstName: 'E2E', lastName: 'Forge', tenantId: br.id });
  const fr = forged.body?.id ? await p.pMTenant.findUnique({ where: { id: forged.body.id } }) : null;
  check('cannot create renter inside another workspace', fr && fr.tenantId === other.id);
  const l3 = await p.lease.findUnique({ where: { id: lease.id } });
  check('lease untouched by other workspace', Number(l3.rentAmount) === 1500);

  // ─── revert ────────────────────────────────────────────────────────────────
  await p.rentLedger.deleteMany({ where: { id: charge.body.id } });
  if (fr) await p.pMTenant.delete({ where: { id: fr.id } });
  await p.user.delete({ where: { id: otherUser.id } });
  await p.tenant.delete({ where: { id: other.id } });
  await p.lease.update({ where: { id: lease.id }, data: { rentAmount: before.lease.rentAmount, depositAmount: before.lease.depositAmount, endDate: before.lease.endDate, notes: before.lease.notes } });
  await p.pMTenant.update({ where: { id: pmt.id }, data: { phone: before.pmt.phone } });
  await p.property.update({ where: { id: prop.id }, data: { notes: before.prop.notes } });
  console.log('\n==============================================');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('==============================================');
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
