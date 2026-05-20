import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';

export const jobFilesRouter = Router();
jobFilesRouter.use(authenticate);

const ALLOWED_MIME = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, HEIC, PDF'));
    }
  },
});

async function assertJobAccess(jobId: string, tenantId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }
  return job;
}

// ── POST /:jobId — upload a file ──────────────────────────────────────────────

jobFilesRouter.post('/:jobId', upload.single('file'), async (req, res) => {
  const { jobId } = req.params;
  const { sub: userId, tenantId } = req.user!;

  if (!req.file) throw new AppError('No file provided', 400, 'NO_FILE');

  await assertJobAccess(jobId, tenantId);

  const {
    fileType = 'photo',
    photoCategory,
    stageType,
    stageName,
    notes,
    noteVisibility = 'internal',
    visibility = 'internal',
    costAmount,
    costBillable,
    receiptCategory,
    vendorName,
    purchaseDate,
    latitude,
    longitude,
  } = req.body as Record<string, string>;

  const file = await prisma.jobFile.create({
    data: {
      tenantId,
      jobId,
      uploadedById: userId,
      fileType,
      photoCategory: photoCategory || null,
      stageType: stageType || null,
      stageName: stageName || null,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      data: req.file.buffer,
      visibility,
      notes: notes || null,
      noteVisibility,
      costAmount: costAmount ? parseFloat(costAmount) : null,
      costBillable: costBillable === 'true',
      receiptCategory: receiptCategory || null,
      vendorName: vendorName || null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    },
    select: {
      id: true, jobId: true, fileType: true, photoCategory: true, stageType: true,
      stageName: true, originalName: true, mimeType: true, fileSizeBytes: true,
      visibility: true, notes: true, noteVisibility: true, costAmount: true,
      costBillable: true, receiptCategory: true, vendorName: true, purchaseDate: true,
      latitude: true, longitude: true, createdAt: true,
      uploadedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  res.status(201).json({ success: true, data: { ...file, url: `/job-files/${jobId}/${file.id}/data` } } satisfies ApiResponse);
});

// ── GET /:jobId — list files ──────────────────────────────────────────────────

jobFilesRouter.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { tenantId } = req.user!;
  const { fileType } = req.query as { fileType?: string };

  await assertJobAccess(jobId, tenantId);

  const files = await prisma.jobFile.findMany({
    where: {
      jobId,
      tenantId,
      deletedAt: null,
      ...(fileType ? { fileType } : {}),
    },
    select: {
      id: true, jobId: true, fileType: true, photoCategory: true, stageType: true,
      stageName: true, originalName: true, mimeType: true, fileSizeBytes: true,
      visibility: true, notes: true, noteVisibility: true, costAmount: true,
      costBillable: true, receiptCategory: true, vendorName: true, purchaseDate: true,
      latitude: true, longitude: true, createdAt: true,
      uploadedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const withUrls = files.map(f => ({
    ...f,
    url: `/job-files/${jobId}/${f.id}/data`,
  }));

  res.json({ success: true, data: withUrls } satisfies ApiResponse);
});

// ── GET /:jobId/:fileId/data — serve file bytes ───────────────────────────────

jobFilesRouter.get('/:jobId/:fileId/data', async (req, res) => {
  const { jobId, fileId } = req.params;
  const { tenantId } = req.user!;

  const file = await prisma.jobFile.findUnique({ where: { id: fileId } });
  if (!file || file.jobId !== jobId || file.tenantId !== tenantId || file.deletedAt) {
    throw new AppError('File not found', 404, 'NOT_FOUND');
  }

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader('Content-Length', file.fileSizeBytes.toString());
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(file.data);
});

// ── PATCH /:jobId/:fileId — update metadata/visibility ───────────────────────

jobFilesRouter.patch('/:jobId/:fileId', async (req, res) => {
  const { jobId, fileId } = req.params;
  const { sub: userId, tenantId, role } = req.user!;

  const file = await prisma.jobFile.findUnique({ where: { id: fileId } });
  if (!file || file.jobId !== jobId || file.tenantId !== tenantId || file.deletedAt) {
    throw new AppError('File not found', 404, 'NOT_FOUND');
  }

  // Techs can only update their own files' visibility/notes
  const isAdmin = role === 'owner' || role === 'admin';
  if (!isAdmin && file.uploadedById !== userId) {
    throw new AppError('You can only edit your own uploads', 403, 'FORBIDDEN');
  }

  const {
    visibility, notes, noteVisibility, costAmount, costBillable,
    receiptCategory, vendorName, purchaseDate,
  } = req.body as Record<string, string | boolean | undefined>;

  const updated = await prisma.jobFile.update({
    where: { id: fileId },
    data: {
      ...(visibility !== undefined ? { visibility: String(visibility) } : {}),
      ...(notes !== undefined ? { notes: notes ? String(notes) : null } : {}),
      ...(noteVisibility !== undefined ? { noteVisibility: String(noteVisibility) } : {}),
      ...(costAmount !== undefined ? { costAmount: costAmount ? parseFloat(String(costAmount)) : null } : {}),
      ...(costBillable !== undefined ? { costBillable: costBillable === 'true' || costBillable === true } : {}),
      ...(receiptCategory !== undefined ? { receiptCategory: receiptCategory ? String(receiptCategory) : null } : {}),
      ...(vendorName !== undefined ? { vendorName: vendorName ? String(vendorName) : null } : {}),
      ...(purchaseDate !== undefined ? { purchaseDate: purchaseDate ? new Date(String(purchaseDate)) : null } : {}),
    },
    select: {
      id: true, visibility: true, notes: true, noteVisibility: true, costAmount: true,
      costBillable: true, receiptCategory: true, vendorName: true, purchaseDate: true, updatedAt: true,
    },
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// ── DELETE /:jobId/:fileId — soft delete ──────────────────────────────────────

jobFilesRouter.delete('/:jobId/:fileId', async (req, res) => {
  const { jobId, fileId } = req.params;
  const { sub: userId, tenantId, role } = req.user!;

  const file = await prisma.jobFile.findUnique({ where: { id: fileId } });
  if (!file || file.jobId !== jobId || file.tenantId !== tenantId || file.deletedAt) {
    throw new AppError('File not found', 404, 'NOT_FOUND');
  }

  const isAdmin = role === 'owner' || role === 'admin';
  if (!isAdmin && file.uploadedById !== userId) {
    throw new AppError('You can only delete your own uploads', 403, 'FORBIDDEN');
  }

  await prisma.jobFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  res.json({ success: true, data: { message: 'File deleted' } } satisfies ApiResponse);
});

// ── GET /:jobId/cost-summary — receipt totals (admin/owner only) ──────────────

jobFilesRouter.get('/:jobId/cost-summary', requireRole('owner', 'admin'), async (req, res) => {
  const { jobId } = req.params;
  const { tenantId } = req.user!;

  await assertJobAccess(jobId, tenantId);

  const receipts = await prisma.jobFile.findMany({
    where: { jobId, tenantId, fileType: 'receipt', deletedAt: null, costAmount: { not: null } },
    select: { id: true, costAmount: true, receiptCategory: true, vendorName: true, purchaseDate: true, notes: true, createdAt: true, originalName: true },
    orderBy: { createdAt: 'asc' },
  });

  const total = receipts.reduce((sum, r) => sum + Number(r.costAmount ?? 0), 0);

  const byCategory: Record<string, number> = {};
  for (const r of receipts) {
    const cat = r.receiptCategory ?? 'misc';
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(r.costAmount ?? 0);
  }

  res.json({
    success: true,
    data: {
      total: Math.round(total * 100) / 100,
      count: receipts.length,
      byCategory,
      receipts: receipts.map(r => ({ ...r, url: `/job-files/${jobId}/${r.id}/data` })),
    },
  } satisfies ApiResponse);
});
