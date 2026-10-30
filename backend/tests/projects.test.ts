import request from 'supertest';
import app from '../src/app';
import { projectIngestionService } from '../src/services/project-ingestion.service';

jest.mock('../src/services/project-ingestion.service', () => ({
  ProjectIngestionError: class ProjectIngestionError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
  projectIngestionService: { ingest: jest.fn(), list: jest.fn(), findById: jest.fn() },
}));

describe('Project routes', () => {
  const project = { id: 'project-1', originalFilename: 'demo.zip', createdAt: '2026-10-29T00:00:00.000Z', fileCount: 1, totalUncompressedBytes: 4, languages: ['TypeScript'], frameworks: [], manifests: [], routes: [], schemas: [], tests: [], files: [] };
  beforeEach(() => { jest.clearAllMocks(); (projectIngestionService.list as jest.Mock).mockResolvedValue([project]); (projectIngestionService.findById as jest.Mock).mockResolvedValue(project); (projectIngestionService.ingest as jest.Mock).mockResolvedValue(project); });

  it('rejects missing and non-ZIP uploads', async () => {
    expect((await request(app).post('/api/v1/projects/ingest')).status).toBe(400);
    const invalid = await request(app).post('/api/v1/projects/ingest').attach('file', Buffer.from('not zip'), { filename: 'file.txt', contentType: 'text/plain' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/ZIP/);
  });

  it('returns saved project overview endpoints', async () => {
    expect((await request(app).get('/api/v1/projects')).body).toEqual([project]);
    expect((await request(app).get('/api/v1/projects/project-1')).body).toEqual(project);
    (projectIngestionService.findById as jest.Mock).mockResolvedValueOnce(null);
    expect((await request(app).get('/api/v1/projects/missing')).status).toBe(404);
  });
});
