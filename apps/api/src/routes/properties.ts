/**
 * Property Management Suite API
 *
 * GET    /properties                   list properties
 * POST   /properties                   create property
 * GET    /properties/:id               get property + units
 * PATCH  /properties/:id               update property
 * DELETE /properties/:id               archive property
 *
 * Units
 * GET    /properties/:id/units         list units for property
 * POST   /properties/:id/units         add unit
 * PATCH  /properties/:id/units/:uid    update unit
 *
 * Tenants (PM)
 * GET    /properties/pm-tenants        list all PM tenants
 * POST   /properties/pm-tenants        create PM tenant
 * PATCH  /properties/pm-tenants/:id    update
 *
 * Leases
 * POST   /properties/leases            create lease
 * PATCH  /properties/leases/:id        update lease
 * GET    /properties/leases/unit/:uid  active lease for unit
 *
 * Rent Ledger
 * GET    /properties/ledger/:leaseId   entries for lease
 * POST   /properties/ledger            add charge or payment
 * PATCH  /properties/ledger/:id        update entry
 *
 * Expenses
 * GET    /properties/:id/expenses      list property expenses
 * POST   /properties/:id/expenses      add expense
 * DELETE /properties/expenses/:id      delete expense
 *
 * Listings
 * GET    /properties/listings          all active listings
 * POST   /properties/listings          create listing
 * PATCH  /properties/listings/:id      update
 * GET    /properties/listings/:id/applications  applications for listing
 * POST   /properties/listings/:id/applications  submit application
 * PATCH  /properties/applications/:id  update status
 *
 * Dashboard
 * GET    /properties/dashboard         NOI, occupancy, rent roll
 */

import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { prisma } from '@fsp/db';
import { authenticate } from '../middleware/authenticate';

export const propertiesRouter = Router();
propertiesRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function bufferToCsvText(buffer: Buffer, mimetype: string, originalname: string): string {
  const isXlsx = mimetype.includes('spreadsheet') || mimetype.includes('excel') || originalname.match(/\.xlsx?$/i);
  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(ws);
  }
  return buffer.toString('utf-8');
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k]?.trim();
    if (val) return val;
  }
  return '';
}

// ─── Properties ───────────────────────────────────────────────────────────────

propertiesRouter.get('/', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const properties = await prisma.property.findMany({
    where: { tenantId, isArchived: false },
    include: {
      units: { select: { id: true, unitNumber: true, isAvailable: true, marketRent: true } },
      ownerContacts: { where: { isPrimary: true }, take: 1 },
    },
    orderBy: { name: 'asc' },
  });
  res.json(properties);
});

propertiesRouter.post('/', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const { name, type, street, city, state, zip, country, totalUnits, yearBuilt, notes } = req.body;
  const property = await prisma.property.create({
    data: { tenantId, name, type, street, city, state, zip, country, totalUnits, yearBuilt, notes },
  });
  res.status(201).json(property);
});

propertiesRouter.get('/:id', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({
    where: { id: req.params.id, tenantId },
    include: {
      units: {
        include: {
          leases: {
            where: { status: 'active' as any },
            include: { pmTenant: true },
            take: 1,
          },
        },
        orderBy: { unitNumber: 'asc' },
      },
      ownerContacts: true,
      expenses: { orderBy: { date: 'desc' }, take: 20 },
    },
  });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(property);
});

propertiesRouter.patch('/:id', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.updateMany({
    where: { id: req.params.id, tenantId },
    data: req.body,
  });
  if (!property.count) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

propertiesRouter.delete('/:id', async (req, res) => {
  const tenantId = req.user!.tenantId;
  await prisma.property.updateMany({
    where: { id: req.params.id, tenantId },
    data: { isArchived: true },
  });
  res.json({ success: true });
});

// ─── Units ────────────────────────────────────────────────────────────────────

propertiesRouter.get('/:id/units', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const units = await prisma.unit.findMany({
    where: { propertyId: req.params.id },
    include: {
      leases: {
        where: { status: 'active' as any },
        include: { pmTenant: true },
        take: 1,
      },
    },
    orderBy: { unitNumber: 'asc' },
  });
  res.json(units);
});

propertiesRouter.post('/:id/units', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const unit = await prisma.unit.create({
    data: { propertyId: req.params.id, ...req.body },
  });
  res.status(201).json(unit);
});

propertiesRouter.patch('/:id/units/:uid', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const unit = await prisma.unit.update({ where: { id: req.params.uid }, data: req.body });
  res.json(unit);
});

// ─── PM Tenants ───────────────────────────────────────────────────────────────

propertiesRouter.get('/pm-tenants', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const tenants = await prisma.pMTenant.findMany({
    where: { tenantId, isArchived: false },
    include: {
      leases: {
        where: { status: 'active' as any },
        include: { unit: { include: { property: { select: { name: true } } } } },
        take: 1,
      },
    },
    orderBy: { lastName: 'asc' },
  });
  res.json(tenants);
});

propertiesRouter.post('/pm-tenants', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.pMTenant.create({ data: { tenantId, ...req.body } });
  res.status(201).json(tenant);
});

propertiesRouter.patch('/pm-tenants/:id', async (req, res) => {
  const tenantId = req.user!.tenantId;
  await prisma.pMTenant.updateMany({ where: { id: req.params.id, tenantId }, data: req.body });
  res.json({ success: true });
});

// ─── Leases ───────────────────────────────────────────────────────────────────

propertiesRouter.get('/leases/unit/:uid', async (req, res) => {
  const lease = await prisma.lease.findFirst({
    where: { unitId: req.params.uid, status: 'active' as any },
    include: {
      pmTenant: true,
      ledgerEntries: { orderBy: { createdAt: 'desc' }, take: 24 },
    },
  });
  res.json(lease);
});

propertiesRouter.post('/leases', async (req, res) => {
  const { unitId, pmTenantId, startDate, endDate, rentAmount, depositAmount, lateFeePct, lateFeeGrace, notes } = req.body;
  // Deactivate previous active lease for unit
  await prisma.lease.updateMany({
    where: { unitId, status: 'active' as any },
    data: { status: 'expired' as any },
  });
  const lease = await prisma.lease.create({
    data: {
      unitId,
      pmTenantId,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      rentAmount,
      depositAmount: depositAmount ?? 0,
      lateFeePct,
      lateFeeGrace,
      notes,
    },
    include: { pmTenant: true },
  });
  // Mark unit as occupied
  await prisma.unit.update({ where: { id: unitId }, data: { isAvailable: false } });
  res.status(201).json(lease);
});

propertiesRouter.patch('/leases/:id', async (req, res) => {
  const lease = await prisma.lease.update({ where: { id: req.params.id }, data: req.body });
  // If lease terminated/expired, mark unit available
  if (req.body.status === 'terminated' || req.body.status === 'expired') {
    await prisma.unit.update({ where: { id: lease.unitId }, data: { isAvailable: true } });
  }
  res.json(lease);
});

// ─── Rent Ledger ──────────────────────────────────────────────────────────────

propertiesRouter.get('/ledger/:leaseId', async (req, res) => {
  const entries = await prisma.rentLedger.findMany({
    where: { leaseId: req.params.leaseId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(entries);
});

propertiesRouter.post('/ledger', async (req, res) => {
  const { leaseId, type, amount, dueDate, notes, status } = req.body;
  const entry = await prisma.rentLedger.create({
    data: {
      leaseId,
      type,
      amount,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      status: status ?? 'pending',
      paidAt: (type === 'payment' || status === 'paid') ? new Date() : undefined,
    },
  });
  res.status(201).json(entry);
});

propertiesRouter.patch('/ledger/:id', async (req, res) => {
  const data: any = { ...req.body };
  if (req.body.status === 'paid' && !req.body.paidAt) {
    data.paidAt = new Date();
  }
  const entry = await prisma.rentLedger.update({ where: { id: req.params.id }, data });
  res.json(entry);
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

propertiesRouter.get('/:id/expenses', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const expenses = await prisma.expense.findMany({
    where: { propertyId: req.params.id },
    orderBy: { date: 'desc' },
    take: 100,
  });
  res.json(expenses);
});

propertiesRouter.post('/:id/expenses', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const expense = await prisma.expense.create({
    data: { propertyId: req.params.id, ...req.body, date: new Date(req.body.date) },
  });
  res.status(201).json(expense);
});

propertiesRouter.delete('/expenses/:id', async (req, res) => {
  await prisma.expense.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─── Owner Contacts ───────────────────────────────────────────────────────────

propertiesRouter.post('/:id/owner-contacts', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const property = await prisma.property.findFirst({ where: { id: req.params.id, tenantId } });
  if (!property) { res.status(404).json({ error: 'Not found' }); return; }
  const contact = await prisma.ownerContact.create({
    data: { propertyId: req.params.id, ...req.body },
  });
  res.status(201).json(contact);
});

// ─── Listings ─────────────────────────────────────────────────────────────────

propertiesRouter.get('/listings', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const listings = await prisma.rentalListing.findMany({
    where: { unit: { property: { tenantId } }, isActive: true },
    include: {
      unit: { include: { property: { select: { name: true, street: true, city: true, state: true } } } },
      applications: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(listings);
});

propertiesRouter.post('/listings', async (req, res) => {
  const listing = await prisma.rentalListing.create({
    data: { ...req.body, availableFrom: new Date(req.body.availableFrom) },
  });
  res.status(201).json(listing);
});

propertiesRouter.patch('/listings/:id', async (req, res) => {
  const listing = await prisma.rentalListing.update({ where: { id: req.params.id }, data: req.body });
  res.json(listing);
});

propertiesRouter.get('/listings/:id/applications', async (req, res) => {
  const applications = await prisma.rentalApplication.findMany({
    where: { listingId: req.params.id },
    orderBy: { appliedAt: 'desc' },
  });
  res.json(applications);
});

propertiesRouter.post('/listings/:id/applications', async (req, res) => {
  const application = await prisma.rentalApplication.create({
    data: { listingId: req.params.id, ...req.body },
  });
  res.status(201).json(application);
});

propertiesRouter.patch('/applications/:id', async (req, res) => {
  const application = await prisma.rentalApplication.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(application);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

propertiesRouter.get('/dashboard', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const [properties, activeLeases, overdueEntries, currentMonthExpenses] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, isArchived: false },
      include: { units: { select: { id: true, isAvailable: true, marketRent: true } } },
    }),
    prisma.lease.findMany({
      where: {
        status: 'active' as any,
        unit: { property: { tenantId } },
      },
      include: { unit: true, pmTenant: true },
    }),
    prisma.rentLedger.findMany({
      where: {
        status: 'overdue' as any,
        lease: { unit: { property: { tenantId } } },
      },
    }),
    prisma.expense.findMany({
      where: {
        property: { tenantId },
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
      },
    }),
  ]);

  const totalUnits = properties.reduce((s, p) => s + p.units.length, 0);
  const occupiedUnits = properties.reduce((s, p) => s + p.units.filter((u) => !u.isAvailable).length, 0);
  const totalMonthlyRent = activeLeases.reduce((s, l) => s + Number(l.rentAmount), 0);
  const totalExpenses = currentMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const overdueAmount = overdueEntries.reduce((s, e) => s + Number(e.amount), 0);

  res.json({
    totalProperties: properties.length,
    totalUnits,
    occupiedUnits,
    vacantUnits: totalUnits - occupiedUnits,
    occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
    totalMonthlyRent,
    totalExpenses,
    noi: totalMonthlyRent - totalExpenses,
    overdueAmount,
    overdueCount: overdueEntries.length,
    activeLeases: activeLeases.length,
    rentRoll: activeLeases.map((l) => ({
      tenantName: `${l.pmTenant.firstName} ${l.pmTenant.lastName}`,
      unit: l.unit.unitNumber,
      rent: Number(l.rentAmount),
      leaseEnd: l.endDate,
    })),
  });
});

// ─── Import: Properties ───────────────────────────────────────────────────────
// Expected columns (flexible matching):
//   name, type, street/address, city, state, zip, total_units, year_built, notes

propertiesRouter.post('/import/preview', upload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const text = bufferToCsvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { data, errors } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (errors.length && !data.length) { res.status(400).json({ error: 'Failed to parse file' }); return; }
  res.json({ headers: Object.keys(data[0] ?? {}), rows: data.slice(0, 5), total: data.length });
});

propertiesRouter.post('/import/properties', upload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const tenantId = req.user!.tenantId;
  const text = bufferToCsvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  let imported = 0, skipped = 0;
  for (const row of data) {
    const name = pick(row, 'name', 'property_name', 'Property Name', 'Name');
    const street = pick(row, 'street', 'address', 'street_address', 'Address', 'Street');
    const city = pick(row, 'city', 'City');
    const state = pick(row, 'state', 'State');
    if (!name || !street) { skipped++; continue; }
    const typeRaw = pick(row, 'type', 'property_type', 'Type').toLowerCase();
    const typeMap: Record<string, string> = {
      residential: 'residential', commercial: 'commercial',
      multi_family: 'multi_family', multifamily: 'multi_family', 'multi-family': 'multi_family',
      hoa: 'hoa', short_term_rental: 'short_term_rental', 'short-term': 'short_term_rental',
    };
    const type = typeMap[typeRaw] ?? 'residential';
    const totalUnitsRaw = pick(row, 'total_units', 'units', 'Total Units', 'Units');
    const totalUnits = totalUnitsRaw ? parseInt(totalUnitsRaw) || 1 : 1;
    const yearBuiltRaw = pick(row, 'year_built', 'year', 'Year Built');
    const yearBuilt = yearBuiltRaw ? parseInt(yearBuiltRaw) || undefined : undefined;

    try {
      await prisma.property.create({
        data: {
          tenantId,
          name,
          type: type as any,
          street,
          city: city || '',
          state: state || '',
          zip: pick(row, 'zip', 'zip_code', 'postal_code', 'Zip', 'ZIP') || '',
          totalUnits,
          yearBuilt,
          notes: pick(row, 'notes', 'Notes'),
        },
      });
      imported++;
    } catch { skipped++; }
  }
  res.json({ imported, skipped, total: data.length });
});

// ─── Import: PM Tenants ───────────────────────────────────────────────────────
// Expected columns:
//   first_name, last_name, email, phone, emergency_name, emergency_phone, notes

propertiesRouter.post('/import/tenants', upload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const tenantId = req.user!.tenantId;
  const text = bufferToCsvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  let imported = 0, updated = 0, skipped = 0;
  for (const row of data) {
    // Support "Full Name" column or split first/last
    let firstName = pick(row, 'first_name', 'firstname', 'First Name', 'FirstName');
    let lastName = pick(row, 'last_name', 'lastname', 'Last Name', 'LastName');
    const fullName = pick(row, 'full_name', 'name', 'Full Name', 'Name', 'Tenant Name');
    if (!firstName && fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName) { skipped++; continue; }

    const email = pick(row, 'email', 'Email', 'email_address');
    const phone = pick(row, 'phone', 'Phone', 'phone_number', 'mobile');

    // Update if same email already exists
    if (email) {
      const existing = await prisma.pMTenant.findFirst({ where: { tenantId, email } });
      if (existing) {
        await prisma.pMTenant.update({
          where: { id: existing.id },
          data: {
            firstName, lastName, phone: phone || existing.phone,
            emergencyName: pick(row, 'emergency_name', 'emergency_contact', 'Emergency Name') || existing.emergencyName,
            emergencyPhone: pick(row, 'emergency_phone', 'Emergency Phone') || existing.emergencyPhone,
            notes: pick(row, 'notes', 'Notes') || existing.notes,
          },
        });
        updated++;
        continue;
      }
    }

    try {
      await prisma.pMTenant.create({
        data: {
          tenantId,
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          emergencyName: pick(row, 'emergency_name', 'emergency_contact', 'Emergency Name') || undefined,
          emergencyPhone: pick(row, 'emergency_phone', 'Emergency Phone') || undefined,
          notes: pick(row, 'notes', 'Notes') || undefined,
        },
      });
      imported++;
    } catch { skipped++; }
  }
  res.json({ imported, updated, skipped, total: data.length });
});
