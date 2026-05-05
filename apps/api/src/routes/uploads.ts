import { Router } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '@fsp/db';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import type { ApiResponse } from '@fsp/types';

export const uploadsRouter = Router();

uploadsRouter.use(authenticate);

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

const BUCKET = process.env.S3_BUCKET_NAME ?? '';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// POST /api/v1/uploads/presign
// Returns a presigned PUT URL for direct browser-to-S3 upload
uploadsRouter.post('/presign', async (req, res) => {
  const { jobId, type, contentType, filename } = req.body as {
    jobId: string;
    type: 'before' | 'after' | 'issue' | 'other';
    contentType: string;
    filename: string;
  };

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new AppError('Only image uploads are supported (jpeg, png, webp, gif, heic)', 400, 'INVALID_CONTENT_TYPE');
  }

  const key = `tenants/${req.user!.tenantId}/jobs/${jobId}/${uuidv4()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  res.json({
    success: true,
    data: {
      presignedUrl,
      key,
      publicUrl: `https://${BUCKET}.s3.amazonaws.com/${key}`,
    },
  } satisfies ApiResponse);
});

// POST /api/v1/uploads/confirm
// Called after successful upload to register the photo in DB
uploadsRouter.post('/confirm', async (req, res) => {
  const { jobId, s3Key, caption, type } = req.body as {
    jobId: string;
    s3Key: string;
    caption?: string;
    type: 'before' | 'after' | 'issue' | 'other';
  };

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== req.user!.tenantId) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  const photo = await prisma.jobPhoto.create({
    data: {
      jobId,
      uploadedById: req.user!.sub,
      s3Key,
      url: `https://${BUCKET}.s3.amazonaws.com/${s3Key}`,
      caption,
      type: type as never,
    },
  });

  res.status(201).json({ success: true, data: photo } satisfies ApiResponse);
});

// POST /api/v1/uploads/training-file
// Stores training resource files in Postgres (no S3 required)
uploadsRouter.post('/training-file', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('No file provided', 400, 'NO_FILE');
  if (req.file.size > 50 * 1024 * 1024) throw new AppError('File too large (max 50 MB)', 400, 'FILE_TOO_LARGE');

  const record = await prisma.trainingFile.create({
    data: {
      tenantId: req.user!.tenantId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      data: req.file.buffer,
    },
  });

  res.json({
    success: true,
    data: {
      id: record.id,
      publicUrl: `/api/v1/uploads/training-file/${record.id}`,
    },
  } satisfies ApiResponse);
});

// GET /api/v1/uploads/training-file/:id
// Serves a stored training file (auth required)
uploadsRouter.get('/training-file/:id', async (req, res) => {
  const record = await prisma.trainingFile.findUnique({ where: { id: req.params.id } });
  if (!record || record.tenantId !== req.user!.tenantId) {
    throw new AppError('Not found', 404, 'NOT_FOUND');
  }
  res.setHeader('Content-Type', record.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.filename)}"`);
  res.setHeader('Content-Length', record.size.toString());
  res.send(record.data);
});

// GET /api/v1/uploads/signed-url/:key
uploadsRouter.get('/signed-url/:key(*)', async (req, res) => {
  const key = req.params.key;
  // Ensure the key belongs to the requesting tenant
  if (!key.startsWith(`tenants/${req.user!.tenantId}/`)) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  res.json({ success: true, data: { url } } satisfies ApiResponse);
});
