import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const contactsRouter = Router();
contactsRouter.use(authenticate);

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

const contactInclude = {
  activities: { orderBy: { createdAt: 'desc' as const }, take: 50 },
  crmJobs: {
    where: { isArchived: false },
    select: { id: true, jobNumber: true, name: true, status: true, estimatedValue: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
};

// ── List ──────────────────────────────────────────────────────────────────────

contactsRouter.get('/', async (req, res) => {
  const {
    search, status, leadSource, followUpDue,
    page = '1', limit = '50', archived = 'false',
    sortBy = 'updatedAt', sortDir = 'desc',
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    isArchived: archived === 'true',
  };

  if (status) where.status = status;
  if (leadSource) where.leadSource = leadSource;

  if (followUpDue) {
    const now = new Date();
    const end = new Date();
    if (followUpDue === 'today') {
      end.setHours(23, 59, 59, 999);
    } else if (followUpDue === 'week') {
      end.setDate(now.getDate() + 7);
    } else if (followUpDue === 'overdue') {
      where.followUpDate = { lt: now };
    }
    if (followUpDue !== 'overdue') {
      where.followUpDate = { gte: now, lte: end };
    }
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { businessName: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['updatedAt', 'createdAt', 'followUpDate', 'fullName', 'businessName'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { crmJobs: true } } },
      orderBy: { [orderField]: sortDir === 'asc' ? 'asc' : 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.contact.count({ where }),
  ]);

  res.json({
    success: true,
    data: contacts,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// ── Get one ───────────────────────────────────────────────────────────────────

contactsRouter.get('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: contactInclude,
  });
  if (!contact || contact.tenantId !== req.user!.tenantId) {
    throw new AppError('Contact not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data: contact } satisfies ApiResponse);
});

// ── Create ────────────────────────────────────────────────────────────────────

contactsRouter.post('/', async (req, res) => {
  const {
    type, businessName, contactPerson, website, industry,
    fullName, howWeMet, phone, email, address, city, state, zip,
    status, leadSource, leadSourceOther, followUpDate, notes,
  } = req.body;

  if (!phone) throw new AppError('phone is required', 400, 'VALIDATION_ERROR');
  if (!leadSource) throw new AppError('leadSource is required', 400, 'VALIDATION_ERROR');
  if (type === 'business' && !businessName) throw new AppError('businessName is required for business contacts', 400, 'VALIDATION_ERROR');
  if (type !== 'business' && !fullName) throw new AppError('fullName is required for individual contacts', 400, 'VALIDATION_ERROR');

  const contact = await prisma.contact.create({
    data: {
      tenantId: req.user!.tenantId,
      type: type ?? 'individual',
      businessName, contactPerson, website, industry,
      fullName, howWeMet,
      phone, email, address, city, state, zip,
      status: status ?? 'prospect',
      leadSource,
      leadSourceOther,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      notes,
      createdById: req.user!.sub,
    },
    include: contactInclude,
  });

  // Log creation activity
  await prisma.contactActivity.create({
    data: {
      contactId: contact.id,
      type: 'note',
      note: 'Contact created',
      createdBy: req.user!.email,
    },
  });

  res.status(201).json({ success: true, data: contact } satisfies ApiResponse);
});

// ── Update ────────────────────────────────────────────────────────────────────

contactsRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Contact not found', 404, 'NOT_FOUND');
  }

  const { status, followUpDate, ...rest } = req.body;

  // Auto-log status changes
  const activities: Array<{ type: string; note: string; createdBy: string }> = [];
  if (status && status !== existing.status) {
    activities.push({
      type: 'status_change',
      note: `Status changed from ${existing.status} to ${status}`,
      createdBy: req.user!.email,
    });
  }
  if (followUpDate && followUpDate !== existing.followUpDate?.toISOString()) {
    activities.push({
      type: 'follow_up_set',
      note: `Follow-up set for ${new Date(followUpDate).toLocaleDateString()}`,
      createdBy: req.user!.email,
    });
  }

  const contact = await prisma.contact.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      status,
      followUpDate: followUpDate ? new Date(followUpDate) : existing.followUpDate,
      // Lead source is immutable
      leadSource: existing.leadSource,
      leadSourceOther: existing.leadSourceOther,
    },
    include: contactInclude,
  });

  if (activities.length > 0) {
    for (const a of activities) {
      await prisma.contactActivity.create({
        data: { contactId: contact.id, type: a.type as 'status_change' | 'follow_up_set', note: a.note, createdBy: a.createdBy },
      });
    }
  }

  res.json({ success: true, data: contact } satisfies ApiResponse);
});

// ── Log activity ──────────────────────────────────────────────────────────────

contactsRouter.post('/:id/activities', async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact || contact.tenantId !== req.user!.tenantId) {
    throw new AppError('Contact not found', 404, 'NOT_FOUND');
  }

  const { type, note } = req.body;
  if (!type) throw new AppError('type is required', 400, 'VALIDATION_ERROR');
  if (type === 'note' && !note?.trim()) throw new AppError('note is required for Note entries', 400, 'VALIDATION_ERROR');

  const activity = await prisma.contactActivity.create({
    data: {
      contactId: contact.id,
      type,
      note: note?.trim() || undefined,
      createdBy: req.user!.email,
    },
  });

  res.status(201).json({ success: true, data: activity } satisfies ApiResponse);
});

// ── Archive (soft delete) ──────────────────────────────────────────────────────

contactsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Contact not found', 404, 'NOT_FOUND');
  }
  await prisma.contact.update({ where: { id: req.params.id }, data: { isArchived: true } });
  res.json({ success: true, data: { message: 'Contact archived' } } satisfies ApiResponse);
});

// ── CSV Export ────────────────────────────────────────────────────────────────

contactsRouter.get('/export/csv', async (req, res) => {
  const { ids, status, leadSource } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId, isArchived: false };
  if (ids) where.id = { in: ids.split(',') };
  if (status) where.status = status;
  if (leadSource) where.leadSource = leadSource;

  const contacts = await prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' } });

  const rows = contacts.map(c => ({
    type: c.type,
    businessName: c.businessName ?? '',
    contactPerson: c.contactPerson ?? '',
    fullName: c.fullName ?? '',
    phone: c.phone,
    email: c.email ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    zip: c.zip ?? '',
    status: c.status,
    leadSource: c.leadSource,
    followUpDate: c.followUpDate?.toISOString().split('T')[0] ?? '',
    notes: c.notes ?? '',
    website: c.website ?? '',
    industry: c.industry ?? '',
    createdAt: c.createdAt.toISOString().split('T')[0],
  }));

  const csv = Papa.unparse(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="contacts_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

// ── CSV Import ────────────────────────────────────────────────────────────────

contactsRouter.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');

  const { mapping, duplicateAction = 'skip' } = req.body as {
    mapping?: string;
    duplicateAction?: 'skip' | 'update' | 'create';
  };

  const fieldMap: Record<string, string> = mapping ? JSON.parse(mapping) : {};
  const text = bufferToCsvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { data: rows, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0 && rows.length === 0) {
    throw new AppError('Failed to parse file. Ensure it is a valid CSV or Excel file.', 400, 'PARSE_ERROR');
  }

  const tenantId = req.user!.tenantId;
  const createdBy = req.user!.email;

  // Get existing phones for duplicate detection
  const existingContacts = await prisma.contact.findMany({
    where: { tenantId, isArchived: false },
    select: { id: true, phone: true },
  });
  const phoneMap = new Map(existingContacts.map(c => [c.phone.replace(/\D/g, ''), c.id]));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const skippedRows: Record<string, string>[] = [];

  for (const row of rows) {
    // Apply field mapping
    const mapped: Record<string, string> = {};
    for (const [csvCol, field] of Object.entries(fieldMap)) {
      if (row[csvCol] !== undefined) mapped[field] = row[csvCol];
    }
    // If no mapping provided, use direct field names
    const data = Object.keys(fieldMap).length > 0 ? mapped : row;

    const phone = (data.phone ?? '').trim().replace(/\D/g, '');
    const fullName = (data.fullName ?? data.full_name ?? data.name ?? '').trim();
    const businessName = (data.businessName ?? data.business_name ?? '').trim();

    if (!phone || (!fullName && !businessName)) {
      skipped++;
      skippedRows.push(row);
      continue;
    }

    const formattedPhone = phone.length === 10 ? `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}` : data.phone;
    const existingId = phoneMap.get(phone);

    if (existingId) {
      if (duplicateAction === 'skip') {
        skipped++;
        skippedRows.push(row);
        continue;
      }
      if (duplicateAction === 'update') {
        await prisma.contact.update({
          where: { id: existingId },
          data: {
            fullName: fullName || undefined,
            businessName: businessName || undefined,
            email: data.email?.trim() || undefined,
            address: data.address?.trim() || undefined,
            city: data.city?.trim() || undefined,
            state: data.state?.trim() || undefined,
            zip: data.zip?.trim() || undefined,
            notes: data.notes?.trim() || undefined,
          },
        });
        updated++;
        continue;
      }
      // 'create' — fall through to create duplicate
    }

    const rawLeadSource = (data.leadSource ?? data.lead_source ?? 'other').toLowerCase().replace(/[^a-z_]/g, '_');
    const validLeadSources = ['natural_contact','door_to_door','business_referral','cold_outreach','social_media','online_ad','google_search','past_customer','other'];
    const leadSource = validLeadSources.includes(rawLeadSource) ? rawLeadSource : 'other';

    await prisma.contact.create({
      data: {
        tenantId,
        type: businessName ? 'business' : 'individual',
        fullName: fullName || undefined,
        businessName: businessName || undefined,
        contactPerson: (data.contactPerson ?? data.contact_person ?? '').trim() || undefined,
        phone: formattedPhone,
        email: data.email?.trim() || undefined,
        address: data.address?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        zip: data.zip?.trim() || undefined,
        status: 'prospect',
        leadSource: leadSource as Parameters<typeof prisma.contact.create>[0]['data']['leadSource'],
        website: data.website?.trim() || undefined,
        industry: data.industry?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        createdById: req.user!.sub,
        activities: {
          create: [{ type: 'note', note: 'Imported from CSV', createdBy }],
        },
      },
    });
    imported++;
  }

  // Build skipped CSV
  let skippedCsv: string | undefined;
  if (skippedRows.length > 0) {
    skippedCsv = Papa.unparse(skippedRows);
  }

  res.json({
    success: true,
    data: { imported, updated, skipped, skippedCsv },
  } satisfies ApiResponse);
});

// ── CSV Preview (parse only, no save) ─────────────────────────────────────────

contactsRouter.post('/import/preview', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');

  const text = bufferToCsvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { data: rows, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    preview: 6,
  });

  res.json({
    success: true,
    data: {
      columns: meta.fields ?? [],
      preview: rows.slice(0, 5),
      totalRows: rows.length,
    },
  } satisfies ApiResponse);
});
