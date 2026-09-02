import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const UPLOAD_DIR = path.resolve(__dirname, '../../..', 'data/uploads');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe unique filename, ignore client filename
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ext === '.csv' ? '.csv' : '.tmp';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // We only accept CSV structural files, reject clear mismatch
  if (file.mimetype !== 'text/csv' && 
      file.mimetype !== 'application/vnd.ms-excel' &&
      !file.originalname.toLowerCase().endsWith('.csv')) {
    return cb(new Error('INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB reasonable limit
  }
});
