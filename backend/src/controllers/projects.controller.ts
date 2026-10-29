import fs from 'fs/promises';
import type { Request, Response } from 'express';
import { ProjectIngestionError, projectIngestionService } from '../services/project-ingestion.service';

export const ingestProject = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Missing file. Please upload a ZIP archive.' }); return; }
  try {
    const project = await projectIngestionService.ingest(req.file.path, req.file.originalname);
    res.status(201).json(project);
  } catch (error) {
    if (error instanceof ProjectIngestionError) {
      const status = error.code === 'RESOURCE_LIMIT' ? 413 : 400;
      res.status(status).json({ error: error.message, code: error.code });
    } else {
      console.error('[ProjectIngestion] Failed to ingest archive', { message: error instanceof Error ? error.message : 'unknown' });
      res.status(500).json({ error: 'Project ingestion could not be completed.' });
    }
  } finally { await fs.rm(req.file.path, { force: true }); }
};

export const listProjects = async (_req: Request, res: Response): Promise<void> => {
  try { res.status(200).json(await projectIngestionService.list()); }
  catch { res.status(500).json({ error: 'Project overview could not be loaded.' }); }
};

export const getProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const project = await projectIngestionService.findById(id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    res.status(200).json(project);
  } catch { res.status(500).json({ error: 'Project overview could not be loaded.' }); }
};
