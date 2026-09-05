import { Request, Response } from 'express';
import fs from 'fs';
import { datasetProfileService } from '../services/dataset-profile.service';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerHttpError,
  ProfilerInvalidResponseError,
} from '../clients/fastapi-profiler.errors';

export const uploadDataset = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing file. Please upload a CSV file.' });
    return;
  }

  const filePath = req.file.path;
  const originalFilename = req.file.originalname;

  try {
    // Basic sanity check for CSV structural content
    const buffer = fs.readFileSync(filePath);
    const chunk = buffer.subarray(0, 512);
    if (chunk.includes(0x00)) {
      res.status(400).json({ error: 'Invalid file format. Expected a text-based CSV.' });
      return;
    }

    // Call service to get profiler report and persist record
    const report = await datasetProfileService.profileDataset(filePath, originalFilename);

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

export const listDatasets = async (_req: Request, res: Response): Promise<void> => {
  try {
    const datasets = await datasetProfileService.listDatasets();
    res.status(200).json(datasets);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error listing datasets' });
  }
};

export const getDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const dataset = await datasetProfileService.getDatasetRecord(id);
    if (!dataset) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.status(200).json(dataset);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error retrieving dataset' });
  }
};

export const deleteDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const success = await datasetProfileService.deleteDataset(id);
    if (!success) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.status(200).json({ message: 'Dataset deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error deleting dataset' });
  }
};
