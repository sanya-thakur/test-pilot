import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { Request } from 'express';
import { projectIngestionLimits } from '../services/project-ingestion.limits';

const UPLOAD_DIR = path.resolve(__dirname, '../../..', 'data/project-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const projectUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.zip`),
  }),
  fileFilter: (_req: Request, file, callback) => {
    const isZip = file.originalname.toLowerCase().endsWith('.zip') || ['application/zip', 'application/x-zip-compressed'].includes(file.mimetype);
    if (!isZip) return callback(new Error('INVALID_PROJECT_ARCHIVE'));
    callback(null, true);
  },
  limits: { fileSize: projectIngestionLimits.maxArchiveBytes, files: 1 },
});
