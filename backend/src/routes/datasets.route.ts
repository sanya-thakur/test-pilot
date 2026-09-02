import { Router, Request, Response, NextFunction } from 'express';
import { uploadDataset } from '../controllers/datasets.controller';
import { uploadMiddleware } from '../storage/upload.storage';

const router = Router();

// Handle multer errors cleanly so we return JSON
const multerErrorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err) {
    if (err.message === 'INVALID_FILE_TYPE') {
      res.status(400).json({ error: 'Unsupported file type. Please upload a CSV file.' });
      return;
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
      return;
    }
    res.status(400).json({ error: 'File upload error' });
    return;
  }
  next();
};

router.post(
  '/profile', 
  (req, res, next) => {
    uploadMiddleware.single('file')(req, res, (err) => {
      multerErrorHandler(err, req, res, next);
    });
  },
  uploadDataset
);

export default router;
