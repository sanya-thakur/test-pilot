import { Router, Request, Response, NextFunction } from 'express';
import { uploadDataset } from '../controllers/datasets.controller';
import { datasetProfileService } from '../services/dataset-profile.service';
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

router.get('/', async (req, res) => {
  try {
    res.status(200).json(await datasetProfileService.list());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while retrieving datasets' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await datasetProfileService.deleteDataset(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while deleting dataset' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const dataset = await datasetProfileService.findById(req.params.id);
    if (!dataset) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.status(200).json(dataset);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while retrieving dataset' });
  }
});

export default router;
