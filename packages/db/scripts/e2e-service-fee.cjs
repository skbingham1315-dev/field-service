/**
 * End-to-end check of the work-request service fee against the running API.
 *
 * Mints its own tokens rather than logging in, so no password is handled here.
 * Drives the real HTTP routes on localhost:3001.
 *
 *   node packages/db/scripts/e2e-service-fee.cjs
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const API = 'http://localhost:3001/api/v1';
const JWT_SECRET = process.env.JWT_SECRET;
const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET || JWT_SECRET + '_portal';
const p = new PrismaClient();

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    console.log('  FAIL  ' + name + (detail ? ' -- ' + detail : ''));
  }
}

async function call(path, opts) {
  const o = opts || {};
  const res = await fetch(API + path, {
    method: o.method || 'GET',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      o.token ? { Authorization: 'Bearer ' + o.token } : {},
    ),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    /* empty body */
  }
  return { status: res.status, body: json };
}

(async () => {
  const org = await p.tenant.findUnique({ where: { slug: 'brandon-rentals' } });
  if (!org) throw new Error('brandon-rentals org missing');
  const owner = await p.user.findFirst({ where: { tenantId: org.id, role: 'owner' } });

  const primary = await p.portalUser.findFirst({
    where: { tenantId: org.id, pmTenant: { leases: { some: { status: 'active' } } } },
    include: { pmTenant: true },
  });
  // An occupant: lives at a unit, but holds no lease of their own.
  const coTenant = await p.portalUser.findFirst({
    where: {
      tenantId: org.id,
      pmTenant: {
        leases: { none: { status: 'active' } },
        occupancies: { some: { removedAt: null, lease: { status: 'active' } } },
      },
    },
    include: { pmTenant: true },
  });

  const adminToken = jwt.sign(
    { sub: owner.id, tenantId: org.id, role: 'owner', email: owner.email, secondaryRoles: [] },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
  const tok = (u) =>
    jwt.sign({ sub: u.id, tenantId: org.id, type: 'portal' }, PORTAL_SECRET, { expiresIn: '1h' });

  console.log('\nOrg: ' + org.name);
  console.log('Primary leaseholder: ' + primary.pmTenant.firstName + ' ' + primary.pmTenant.lastName);
  console.log('Occupant:            ' + coTenant.pmTenant.firstName + ' ' + coTenant.pmTenant.lastName + '\n');

  // 1. Rental context
  console.log('1. Rental context');
  const me = await call('/portal/me', { token: tok(primary) });
  check('primary /me returns 200', me.status === 200, 'got ' + me.status);
  check('primary resolves a property', !!(me.body && me.body.rental && me.body.rental.propertyId));
  if (me.body && me.body.rental) {
    console.log('      property: ' + me.body.rental.propertyName + ' -- ' + me.body.rental.address);
  }
  check('primary is flagged as leaseholder', me.body.rental.isLeaseholder === true);

  const meCo = await call('/portal/me', { token: tok(coTenant) });
  check('occupant also resolves a property', !!(meCo.body.rental && meCo.body.rental.propertyId));
  check('occupant is NOT flagged as leaseholder', meCo.body.rental.isLeaseholder === false);
  if (meCo.body.rental) {
    console.log('      occupant property: ' + meCo.body.rental.propertyName);
  }

  // An occupant submitting a request should get the same auto-addressing.
  const occReq = await call('/portal/work-requests', {
    method: 'POST',
    token: tok(coTenant),
    body: { title: 'Outlet not working', description: 'test', urgency: 'normal', acknowledgedFee: true },
  });
  check('occupant can submit', occReq.status === 201, 'got ' + occReq.status);
  check('occupant request is auto-addressed', !!occReq.body.propertyId);

  // 2. Fee quote
  console.log('\n2. Fee quote');
  const normal = await call('/portal/service-fee?urgency=normal', { token: tok(primary) });
  check('normal urgency quotes a fee', normal.body.applies === true);
  check('quoted amount is $50', normal.body.amount === 50, 'got ' + normal.body.amount);
  check('normal requires acknowledgement', normal.body.requiresAcknowledgement === true);

  const emerg = await call('/portal/service-fee?urgency=emergency', { token: tok(primary) });
  check('emergency is NOT charged', emerg.body.applies === false);
  check('emergency needs no acknowledgement', emerg.body.requiresAcknowledgement === false);
  check('emergency still shows safety guidance', /911/.test(emerg.body.disclosure || ''));

  // 3. Acknowledgement gate
  console.log('\n3. Acknowledgement gate');
  const noAck = await call('/portal/work-requests', {
    method: 'POST',
    token: tok(primary),
    body: { title: 'Dishwasher leaking', description: 'Water pooling under the door.', urgency: 'normal' },
  });
  check('submit without ack is rejected', noAck.status === 400, 'got ' + noAck.status);
  check('rejection names the reason', noAck.body.code === 'FEE_ACKNOWLEDGEMENT_REQUIRED');

  const withAck = await call('/portal/work-requests', {
    method: 'POST',
    token: tok(primary),
    body: {
      title: 'Dishwasher leaking',
      description: 'Water pooling under the door.',
      urgency: 'normal',
      acknowledgedFee: true,
    },
  });
  check('submit with ack succeeds', withAck.status === 201, 'got ' + withAck.status);
  check('fee frozen at $50', Number(withAck.body.feeAmount) === 50, 'got ' + withAck.body.feeAmount);
  check('status is disclosed', withAck.body.feeStatus === 'disclosed', withAck.body.feeStatus);
  check('property auto-stamped', !!withAck.body.propertyId);
  check('address filled from lease', !!withAck.body.serviceAddress);

  const emergReq = await call('/portal/work-requests', {
    method: 'POST',
    token: tok(primary),
    body: { title: 'Smell of gas', description: 'Strong gas smell near the range.', urgency: 'emergency' },
  });
  check('emergency submits without ack', emergReq.status === 201, 'got ' + emergReq.status);
  check('emergency carries no fee', emergReq.body.feeStatus === 'not_applicable', emergReq.body.feeStatus);

  // 4. Fee decision
  console.log('\n4. Fee decision');
  const mk = async (title) =>
    (
      await call('/portal/work-requests', {
        method: 'POST',
        token: tok(primary),
        body: { title, description: 'test', urgency: 'normal', acknowledgedFee: true },
      })
    ).body;

  const landlordReq = await mk('AC not cooling');
  const r1 = await call('/portal/admin/work-requests/' + landlordReq.id + '/fee', {
    method: 'PATCH',
    token: adminToken,
    body: { responsibility: 'landlord', note: 'Compressor failure -- owner responsibility.' },
  });
  // Clients choose whether landlord-responsibility repairs are waived (Brandon Rentals charges them).
  const cfg = await p.portalConfig.findUnique({ where: { tenantId: org.id } });
  const expectLandlord = cfg.serviceFeeWaiveLandlord ? 'waived' : 'assessed';
  check('landlord responsibility -> ' + expectLandlord, r1.body.feeStatus === expectLandlord, r1.body.feeStatus);

  const tenantReq = await mk('Garbage disposal jammed');
  const r2 = await call('/portal/admin/work-requests/' + tenantReq.id + '/fee', {
    method: 'PATCH',
    token: adminToken,
    body: { responsibility: 'tenant', note: 'Silverware in the disposal.' },
  });
  check('tenant responsibility -> assessed', r2.body.feeStatus === 'assessed', r2.body.feeStatus);
  check('assessed keeps the $50', Number(r2.body.feeAmount) === 50);

  const nffReq = await mk('Outlet not working');
  const r3 = await call('/portal/admin/work-requests/' + nffReq.id + '/fee', {
    method: 'PATCH',
    token: adminToken,
    body: { responsibility: 'no_fault_found' },
  });
  check('no-fault-found -> assessed', r3.body.feeStatus === 'assessed', r3.body.feeStatus);

  const r4 = await call('/portal/admin/work-requests/' + emergReq.body.id + '/fee', {
    method: 'PATCH',
    token: adminToken,
    body: { responsibility: 'tenant' },
  });
  check(
    'emergency stays unbilled even if tenant-caused',
    r4.body.feeStatus === 'not_applicable',
    r4.body.feeStatus,
  );

  const bad = await call('/portal/admin/work-requests/' + nffReq.id + '/fee', {
    method: 'PATCH',
    token: adminToken,
    body: { responsibility: 'whatever' },
  });
  check('invalid responsibility rejected', bad.status === 400, 'got ' + bad.status);

  // 5. Convert to CRM job
  console.log('\n5. Convert to CRM job');
  const conv = await call('/portal/admin/work-requests/' + tenantReq.id + '/convert', {
    method: 'POST',
    token: adminToken,
  });
  check('conversion returns a job', conv.status === 201, 'got ' + conv.status + ' ' + JSON.stringify(conv.body));
  check('job number allocated', /^JOB-\d{4}-\d{4}$/.test((conv.body && conv.body.jobNumber) || ''), conv.body && conv.body.jobNumber);
  check('contact created/reused', !!(conv.body && conv.body.contactId));

  const again = await call('/portal/admin/work-requests/' + tenantReq.id + '/convert', {
    method: 'POST',
    token: adminToken,
  });
  check('double conversion blocked', again.status === 409, 'got ' + again.status);

  // 6. Isolation
  console.log('\n6. Isolation');
  const others = await call('/portal/work-requests', { token: tok(coTenant) });
  const seen = (others.body || []).length;
  // The occupant filed exactly one request above and must see only that one.
  check('occupant sees only their own request', seen === 1, 'saw ' + seen);
  const noAuth = await call('/portal/service-fee');
  check('unauthenticated fee lookup rejected', noAuth.status === 401, 'got ' + noAuth.status);

  console.log('\n' + '='.repeat(46));
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('='.repeat(46));
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL', e);
  await p.$disconnect();
  process.exit(1);
});
