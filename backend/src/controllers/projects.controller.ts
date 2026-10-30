import fs from 'fs/promises';
import type { Request, Response } from 'express';
import { ProjectIngestionError, projectIngestionService } from '../services/project-ingestion.service';
import { ProjectAIAssistantRequestSchema } from '../contracts/project-ai-assistant.contract';
import { ProjectSourceUnavailableError, projectAIAssistantService } from '../services/project-ai-assistant.service';
import { AIProviderAPIError, AIProviderConfigError, AIProviderError, AIProviderTimeoutError } from '../contracts/ai-provider.contract';

const publicProject = <T extends { sourceRoot?: string }>(project: T): Omit<T, 'sourceRoot'> => {
  const { sourceRoot: _sourceRoot, ...safe } = project; return safe;
};

export const ingestProject = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Missing file. Please upload a ZIP archive.' }); return; }
  try {
    const project = await projectIngestionService.ingest(req.file.path, req.file.originalname);
    res.status(201).json(publicProject(project));
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
  try { res.status(200).json((await projectIngestionService.list()).map(publicProject)); }
  catch { res.status(500).json({ error: 'Project overview could not be loaded.' }); }
};

export const getProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const project = await projectIngestionService.findById(id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    res.status(200).json(publicProject(project));
  } catch { res.status(500).json({ error: 'Project overview could not be loaded.' }); }
};

export const askProjectAssistant = async (req: Request, res: Response): Promise<void> => {
  const parsed = ProjectAIAssistantRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a question and at most 12 valid history messages.' }); return; }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const response = await projectAIAssistantService.ask(id, parsed.data);
    if (!response) { res.status(404).json({ error: 'Project not found' }); return; }
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ProjectSourceUnavailableError) res.status(409).json({ error: 'This project was uploaded before project AI was enabled. Re-upload the ZIP to ask source-aware questions.' });
    else if (error instanceof AIProviderTimeoutError) res.status(504).json({ error: 'AI provider request timed out' });
    else if (error instanceof AIProviderConfigError) res.status(503).json({ error: 'AI provider configuration error' });
    else if (error instanceof AIProviderAPIError || error instanceof AIProviderError) res.status(502).json({ error: 'AI provider could not answer right now' });
    else res.status(500).json({ error: 'Project assistant could not answer right now' });
  }
};
