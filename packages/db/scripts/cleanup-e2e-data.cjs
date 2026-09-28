/**
 * Remove the records created by e2e-service-fee.cjs so the client's data stays clean.
 * Matches only the exact titles that test writes.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const TEST_TITLES = [
  'Dishwasher leaking',
  'Smell of gas',
  'AC not cooling',
  'Garbage disposal jammed',
  'Outlet not working',
];

(async () => {
  const org = await p.tenant.findUnique({ where: { slug: 'brandon-rentals' } });
  if (!org) throw new Error('brandon-rentals org missing');

  const reqs = await p.portalWorkRequest.findMany({
    where: { tenantId: org.id, title: { in: TEST_TITLES } },
    select: { id: true, crmJobId: true, title: true },
  });

  const jobIds = reqs.map((r) => r.crmJobId).filter(Boolean);

  const delReqs = await p.portalWorkRequest.deleteMany({
    where: { id: { in: reqs.map((r) => r.id) } },
  });

  let delJobs = { count: 0 };
  if (jobIds.length) {
    delJobs = await p.cRMJob.deleteMany({ where: { id: { in: jobIds }, tenantId: org.id } });
  }

  // The converter auto-creates a Contact; remove only ones it created.
  const delContacts = await p.contact.deleteMany({
    where: {
      tenantId: org.id,
      notes: 'Created automatically from a tenant portal work request.',
      crmJobs: { none: {} },
    },
  });

  console.log(`Removed ${delReqs.count} work requests, ${delJobs.count} CRM jobs, ${delContacts.count} contacts.`);

  const remaining = await p.portalWorkRequest.count({ where: { tenantId: org.id } });
  console.log(`${remaining} work requests remain for ${org.name}.`);
  await p.$disconnect();
})().catch(async (e) => {
  console.error('FATAL', e.message);
  await p.$disconnect();
  process.exit(1);
});
