import { Router } from 'express';
import Papa from 'papaparse';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const crmJobsRouter = Router();
crmJobsRouter.use(authenticate);

const jobInclude = {
  contact: {
    select: {
      id: true, type: true, fullName: true, businessName: true,
      phone: true, email: true, leadSource: true,
    },
  },
  subcontractor: {
    select: { id: true, name: true, phone: true, email: true, defaultPercentage: true, defaultRateType: true },
  },
  activities: { orderBy: { createdAt: 'desc' as const }, take: 50 },
};

// ── Auto-generate job number ──────────────────────────────────────────────────

async function nextJobNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.cRMJob.findFirst({
    where: { tenantId, jobNumber: { startsWith: `JOB-${year}-` } },
    orderBy: { jobNumber: 'desc' },
  });
  const seq = last ? parseInt(last.jobNumber.split('-')[2] ?? '0') + 1 : 1;
  return `JOB-${year}-${String(seq).padStart(4, '0')}`;
}

// ── List ──────────────────────────────────────────────────────────────────────

crmJobsRouter.get('/', async (req, res) => {
  const {
    search, status, executionType, contactId,
    page = '1', limit = '50',
    sortBy = 'createdAt', sortDir = 'desc',
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: Record<string, unknown> = { tenantId: req.user!.tenantId, isArchived: false };

  if (status) where.status = status;
  if (executionType) where.executionType = executionType;
  if (contactId) where.contactId = contactId;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { jobNumber: { contains: search, mode: 'insensitive' } },
      { contact: { fullName: { contains: search, mode: 'insensitive' } } },
      { contact: { businessName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const validSortFields = ['createdAt', 'updatedAt', 'estimatedStartDate', 'estimatedValue', 'jobNumber'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [jobs, total] = await Promise.all([
    prisma.cRMJob.findMany({
      where,
      include: {
        contact: { select: { id: true, type: true, fullName: true, businessName: true, phone: true } },
        subcontractor: { select: { id: true, name: true } },
      },
      orderBy: { [orderField]: sortDir === 'asc' ? 'asc' : 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.cRMJob.count({ where }),
  ]);

  res.json({
    success: true,
    data: jobs,
    meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
  } satisfies ApiResponse);
});

// ── Get one ───────────────────────────────────────────────────────────────────

crmJobsRouter.get('/:id', async (req, res) => {
  const job = await prisma.cRMJob.findUnique({
    where: { id: req.params.id },
    include: jobInclude,
  });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data: job } satisfies ApiResponse);
});

// ── Create ────────────────────────────────────────────────────────────────────

crmJobsRouter.post('/', async (req, res) => {
  const {
    name, contactId, serviceAddress, serviceCity, serviceState, serviceZip,
    tradeCategory, status, executionType, assignedToId, subcontractorId,
    estimatedStartDate, completionDate, estimatedValue, actualInvoiceAmount,
    permitRequired, permitNumber, notes,
    subPaymentType, subPaymentAmount, subPaymentPercent,
    materialsCost, otherCosts, targetMargin,
  } = req.body;

  if (!name) throw new AppError('name is required', 400, 'VALIDATION_ERROR');
  if (!contactId) throw new AppError('contactId is required', 400, 'VALIDATION_ERROR');

  // Verify contact belongs to tenant
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.tenantId !== req.user!.tenantId) {
    throw new AppError('Contact not found', 404, 'NOT_FOUND');
  }

  const jobNumber = await nextJobNumber(req.user!.tenantId);

  const job = await prisma.cRMJob.create({
    data: {
      tenantId: req.user!.tenantId,
      jobNumber,
      name, contactId,
      serviceAddress: serviceAddress || contact.address,
      serviceCity: serviceCity || contact.city,
      serviceState: serviceState || contact.state,
      serviceZip: serviceZip || contact.zip,
      tradeCategory, status, executionType,
      assignedToId, subcontractorId,
      estimatedStartDate: estimatedStartDate ? new Date(estimatedStartDate) : undefined,
      completionDate: completionDate ? new Date(completionDate) : undefined,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
      actualInvoiceAmount: actualInvoiceAmount ? parseFloat(actualInvoiceAmount) : undefined,
      permitRequired, permitNumber, notes,
      subPaymentType,
      subPaymentAmount: subPaymentAmount ? parseFloat(subPaymentAmount) : undefined,
      subPaymentPercent: subPaymentPercent ? parseFloat(subPaymentPercent) : undefined,
      materialsCost: materialsCost ? parseFloat(materialsCost) : undefined,
      otherCosts: otherCosts ? parseFloat(otherCosts) : undefined,
      targetMargin: targetMargin ? parseFloat(targetMargin) : 25,
      createdById: req.user!.sub,
      activities: {
        create: [{ type: 'note', note: 'Job created', createdBy: req.user!.email }],
      },
    },
    include: jobInclude,
  });

  res.status(201).json({ success: true, data: job } satisfies ApiResponse);
});

// ── Update ────────────────────────────────────────────────────────────────────

crmJobsRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.cRMJob.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  const { status, estimatedStartDate, completionDate, estimatedValue, actualInvoiceAmount,
    subPaymentAmount, subPaymentPercent, materialsCost, otherCosts, targetMargin, ...rest } = req.body;

  const activities: Array<{ type: string; note: string; createdBy: string }> = [];
  if (status && status !== existing.status) {
    activities.push({
      type: 'status_change',
      note: `Status changed from ${existing.status} to ${status}`,
      createdBy: req.user!.email,
    });
  }

  const job = await prisma.cRMJob.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      status,
      estimatedStartDate: estimatedStartDate ? new Date(estimatedStartDate) : undefined,
      completionDate: completionDate ? new Date(completionDate) : undefined,
      estimatedValue: estimatedValue !== undefined ? parseFloat(estimatedValue) : undefined,
      actualInvoiceAmount: actualInvoiceAmount !== undefined ? parseFloat(actualInvoiceAmount) : undefined,
      subPaymentAmount: subPaymentAmount !== undefined ? parseFloat(subPaymentAmount) : undefined,
      subPaymentPercent: subPaymentPercent !== undefined ? parseFloat(subPaymentPercent) : undefined,
      materialsCost: materialsCost !== undefined ? parseFloat(materialsCost) : undefined,
      otherCosts: otherCosts !== undefined ? parseFloat(otherCosts) : undefined,
      targetMargin: targetMargin !== undefined ? parseFloat(targetMargin) : undefined,
    },
    include: jobInclude,
  });

  if (activities.length > 0) {
    for (const a of activities) {
      await prisma.cRMJobActivity.create({
        data: { jobId: job.id, type: a.type as 'status_change', note: a.note, createdBy: a.createdBy },
      });
    }
  }

  res.json({ success: true, data: job } satisfies ApiResponse);
});

// ── Log activity ──────────────────────────────────────────────────────────────

crmJobsRouter.post('/:id/activities', async (req, res) => {
  const job = await prisma.cRMJob.findUnique({ where: { id: req.params.id } });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  const { type, note } = req.body;
  if (!type) throw new AppError('type is required', 400, 'VALIDATION_ERROR');

  const activity = await prisma.cRMJobActivity.create({
    data: {
      jobId: job.id,
      type,
      note: note?.trim() || undefined,
      createdBy: req.user!.email,
    },
  });

  res.status(201).json({ success: true, data: activity } satisfies ApiResponse);
});

// ── Archive ───────────────────────────────────────────────────────────────────

crmJobsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.cRMJob.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }
  await prisma.cRMJob.update({ where: { id: req.params.id }, data: { isArchived: true } });
  res.json({ success: true, data: { message: 'Job archived' } } satisfies ApiResponse);
});

// ── Permit Pro CSV Export ─────────────────────────────────────────────────────

crmJobsRouter.get('/export/permit-pro', async (req, res) => {
  const { ids, status, startAfter, startBefore } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId, isArchived: false };
  if (ids) where.id = { in: ids.split(',') };
  if (status) where.status = status;
  if (startAfter || startBefore) {
    where.estimatedStartDate = {
      ...(startAfter ? { gte: new Date(startAfter) } : {}),
      ...(startBefore ? { lte: new Date(startBefore) } : {}),
    };
  }

  const jobs = await prisma.cRMJob.findMany({
    where,
    include: {
      contact: { select: { fullName: true, businessName: true, contactPerson: true, phone: true, email: true } },
    },
  });

  // Fetch company settings from tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { settings: true, name: true },
  });
  const settings = (tenant?.settings as Record<string, string> | null) ?? {};
  const companyName = settings.companyName ?? tenant?.name ?? '';
  const contractorLicense = settings.contractorLicense ?? '';
  const contractorPhone = settings.contractorPhone ?? '';

  const rows = jobs.map(j => {
    const clientName = j.contact.fullName ?? j.contact.businessName ?? j.contact.contactPerson ?? '';
    return {
      'Project Address': [j.serviceAddress, j.serviceCity, j.serviceState, j.serviceZip].filter(Boolean).join(', '),
      'Owner Name': clientName,
      'Owner Phone': j.contact.phone ?? '',
      'Owner Email': j.contact.email ?? '',
      'Contractor Name': companyName,
      'Contractor License': contractorLicense,
      'Contractor Phone': contractorPhone,
      'Scope of Work': j.name,
      'Trade / Category': j.tradeCategory ?? '',
      'Estimated Value': j.estimatedValue ? `$${Number(j.estimatedValue).toFixed(2)}` : '',
      'Permit Number': j.permitNumber ?? '',
      'Start Date': j.estimatedStartDate ? j.estimatedStartDate.toISOString().split('T')[0] : '',
    };
  });

  const csv = Papa.unparse(rows);
  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="PermitPro_Export_${dateStr}.csv"`);
  res.send(csv);
});

// ── Analytics (lead source + pipeline) ───────────────────────────────────────

crmJobsRouter.get('/analytics/summary', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const [contactsByStatus, contactsByLeadSource, jobsByStatus, jobsByExecType, recentJobs] = await Promise.all([
    prisma.contact.groupBy({
      by: ['status'],
      where: { tenantId, isArchived: false },
      _count: { id: true },
    }),
    prisma.contact.groupBy({
      by: ['leadSource'],
      where: { tenantId, isArchived: false },
      _count: { id: true },
    }),
    prisma.cRMJob.groupBy({
      by: ['status'],
      where: { tenantId, isArchived: false },
      _count: { id: true },
      _sum: { actualInvoiceAmount: true, estimatedValue: true },
    }),
    prisma.cRMJob.groupBy({
      by: ['executionType'],
      where: { tenantId, isArchived: false },
      _count: { id: true },
      _sum: { actualInvoiceAmount: true },
    }),
    // Monthly revenue last 12 months
    prisma.cRMJob.findMany({
      where: {
        tenantId, isArchived: false,
        status: { in: ['invoiced', 'paid'] },
        completionDate: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      },
      select: { completionDate: true, actualInvoiceAmount: true },
    }),
  ]);

  // Lead source performance: join contacts + won jobs
  const leadSourceJobs = await prisma.cRMJob.findMany({
    where: { tenantId, isArchived: false, status: { in: ['completed', 'invoiced', 'paid'] } },
    include: { contact: { select: { leadSource: true } } },
  });

  const leadSourceMap: Record<string, { contacts: number; jobsWon: number; revenue: number }> = {};
  for (const row of contactsByLeadSource) {
    leadSourceMap[row.leadSource] = { contacts: row._count.id, jobsWon: 0, revenue: 0 };
  }
  for (const job of leadSourceJobs) {
    const ls = job.contact.leadSource;
    if (!leadSourceMap[ls]) leadSourceMap[ls] = { contacts: 0, jobsWon: 0, revenue: 0 };
    leadSourceMap[ls].jobsWon++;
    leadSourceMap[ls].revenue += Number(job.actualInvoiceAmount ?? 0);
  }

  // Monthly revenue buckets
  const monthly: Record<string, number> = {};
  for (const job of recentJobs) {
    if (!job.completionDate) continue;
    const key = `${job.completionDate.getFullYear()}-${String(job.completionDate.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = (monthly[key] ?? 0) + Number(job.actualInvoiceAmount ?? 0);
  }

  // Follow-ups due today
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const followUpToday = await prisma.contact.count({
    where: { tenantId, isArchived: false, followUpDate: { gte: now, lte: todayEnd } },
  });
  const followUpOverdue = await prisma.contact.count({
    where: { tenantId, isArchived: false, followUpDate: { lt: now } },
  });

  res.json({
    success: true,
    data: {
      contactsByStatus,
      contactsByLeadSource,
      jobsByStatus,
      jobsByExecType,
      leadSourcePerformance: Object.entries(leadSourceMap).map(([source, d]) => ({
        source,
        totalContacts: d.contacts,
        jobsWon: d.jobsWon,
        conversionPct: d.contacts > 0 ? Math.round((d.jobsWon / d.contacts) * 100) : 0,
        totalRevenue: d.revenue,
        avgJobValue: d.jobsWon > 0 ? Math.round(d.revenue / d.jobsWon) : 0,
      })),
      monthlyRevenue: Object.entries(monthly).map(([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month)),
      followUpToday,
      followUpOverdue,
    },
  } satisfies ApiResponse);
});
