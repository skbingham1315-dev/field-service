import { Request, Response } from 'express';
import type { ApiResponse } from '@fsp/types';

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  } satisfies ApiResponse);
}
