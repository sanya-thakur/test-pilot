import { Request, Response } from 'express';
import fs from 'fs';
import { datasetProfileService } from '../services/dataset-profile.service';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerHttpError,
  ProfilerInvalidResponseError
} from '../clients/fastapi-profiler.errors';

export const uploadDataset = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing file. Please upload a CSV file.' });
    return;
  }

  const filePath = req.file.path;

  try {
    // Basic sanity check for CSV structural content
    const buffer = fs.readFileSync(filePath);
    const chunk = buffer.subarray(0, 512);
    if (chunk.includes(0x00)) {
      res.status(400).json({ error: 'Invalid file format. Expected a text-based CSV.' });
      return;
    }

    // Call service to get profiler report
    const report = await datasetProfileService.profileDataset(filePath, {
      originalFilename: req.file.originalname,
      storedFilename: req.file.filename,
    });

    res.status(200).json(report);
  } catch (err) {
    if (err instanceof ProfilerUnavailableError) {
      res.status(503).json({ error: 'Profiler service unavailable' });
    } else if (err instanceof ProfilerTimeoutError) {
      res.status(504).json({ error: 'Profiler request timed out' });
    } else if (err instanceof ProfilerHttpError || err instanceof ProfilerInvalidResponseError) {
      res.status(502).json({ error: 'Bad gateway: Profiler returned an error or invalid response' });
    } else {
      res.status(500).json({ error: 'Internal server error during profiling orchestration' });
    }
  } finally {
    // Cleanup temporary file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to clean up file:', filePath, e);
      }
    }
  }
};
