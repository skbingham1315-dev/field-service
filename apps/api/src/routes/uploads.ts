import { Router } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '@fsp/db';
import { v4 as uuidv4 } from 'uuid';
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

// POST /api/v1/uploads/training-presign
// Returns a presigned PUT URL for training resource file upload (Word, PDF, video, etc.)
uploadsRouter.post('/training-presign', async (req, res) => {
  const { contentType, filename } = req.body as { contentType: string; filename: string };

  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new AppError('File type not supported', 400, 'INVALID_CONTENT_TYPE');
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `tenants/${req.user!.tenantId}/training/${uuidv4()}-${safeFilename}`;

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
