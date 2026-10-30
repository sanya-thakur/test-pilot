import { Router, type NextFunction, type Request, type Response } from 'express';
import { askProjectAssistant, deleteProject, downloadGeneratedDataset, generateDataset, getProject, ingestProject, listProjects } from '../controllers/projects.controller';
import { projectUploadMiddleware } from '../storage/project-upload.storage';
import { megabytes, projectIngestionLimits } from '../services/project-ingestion.limits';

const router = Router();
const upload = (req: Request, res: Response, next: NextFunction): void => {
  projectUploadMiddleware.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.message === 'INVALID_PROJECT_ARCHIVE') { res.status(400).json({ error: 'Unsupported file type. Please upload a ZIP archive.' }); return; }
    if ((error as { code?: string }).code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: `Archive too large. Maximum compressed size is ${megabytes(projectIngestionLimits.maxArchiveBytes)}.` }); return; }
    res.status(400).json({ error: 'Project upload error.' });
  });
};

router.post('/ingest', upload, ingestProject);
router.get('/', listProjects);
router.delete('/:id', deleteProject);
router.post('/:id/ai-assistant', askProjectAssistant);
router.post('/:id/datasets/generate', generateDataset);
router.get('/:id/datasets/:artifactId/download', downloadGeneratedDataset);
router.get('/:id', getProject);
export default router;
