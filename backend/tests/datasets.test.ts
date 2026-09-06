import request from 'supertest';
import app from '../src/app';
import fs from 'fs';
import path from 'path';
import { datasetProfileService } from '../src/services/dataset-profile.service';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerInvalidResponseError,
} from '../src/clients/fastapi-profiler.errors';

jest.mock('../src/services/dataset-profile.service', () => ({
  datasetProfileService: {
    profileDataset: jest.fn(),
    findById: jest.fn(),
    getDatasetRecord: jest.fn(),
    list: jest.fn(),
    listDatasets: jest.fn(),
    deleteDataset: jest.fn(),
  },
}));

describe('Dataset Routes (/api/v1/datasets)', () => {
  const dummyCsvPath = path.join(__dirname, 'dummy.csv');
  const dummyBinPath = path.join(__dirname, 'dummy.bin');

  beforeAll(() => {
    fs.writeFileSync(dummyCsvPath, 'id,name\n1,Alice\n2,Bob');
    fs.writeFileSync(dummyBinPath, Buffer.from([0x00, 0x01, 0x02, 0x00]));
  });

  afterAll(() => {
    if (fs.existsSync(dummyCsvPath)) fs.unlinkSync(dummyCsvPath);
    if (fs.existsSync(dummyBinPath)) fs.unlinkSync(dummyBinPath);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (datasetProfileService.profileDataset as jest.Mock).mockResolvedValue({ health_score: 85, datasetId: 'dataset-id' });
    (datasetProfileService.list as jest.Mock).mockResolvedValue([
      { id: 'dataset-id', originalFilename: 'test.csv', createdAt: '2026-01-01T00:00:00.000Z', healthScore: 85, profilerVersion: 'testpilot-profiler-v1' },
    ]);
    (datasetProfileService.listDatasets as jest.Mock).mockResolvedValue([
      { id: 'dataset-id', originalFilename: 'test.csv', createdAt: '2026-01-01T00:00:00.000Z', healthScore: 85, profilerVersion: 'testpilot-profiler-v1' },
    ]);
    (datasetProfileService.findById as jest.Mock).mockResolvedValue({
      id: 'dataset-id', originalFilename: 'test.csv', storedFilename: 'safe.csv', createdAt: '2026-01-01T00:00:00.000Z',
      profilerVersion: 'testpilot-profiler-v1', healthScore: 85, report: { health_score: { score: 85 } },
    });
    (datasetProfileService.getDatasetRecord as jest.Mock).mockResolvedValue({
      id: 'dataset-id', originalFilename: 'test.csv', storedFilename: 'safe.csv', createdAt: '2026-01-01T00:00:00.000Z',
      profilerVersion: 'testpilot-profiler-v1', healthScore: 85, report: { health_score: { score: 85 } },
    });
    (datasetProfileService.deleteDataset as jest.Mock).mockResolvedValue(true);
  });

  describe('POST /api/v1/datasets/profile', () => {
    it('should reject missing file', async () => {
      const res = await request(app).post('/api/v1/datasets/profile');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing file/);
    });

    it('should reject unsupported file type based on extension/mimetype', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/profile')
        .attach('file', dummyBinPath, 'dummy.exe');

      expect(res.status).toBe(400);
    });

    it('should accept valid CSV, return profiler report, and cleanup file', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/profile')
        .attach('file', dummyCsvPath, 'test.csv');

      expect(res.status).toBe(200);
      expect(res.body.health_score).toBe(85);
      expect(res.body.datasetId).toBe('dataset-id');
      expect(datasetProfileService.profileDataset).toHaveBeenCalled();

      const calledPath = (datasetProfileService.profileDataset as jest.Mock).mock.calls[0][0];
      expect(fs.existsSync(calledPath)).toBe(false);
    });

    it('should return 503 and cleanup if profiler is unavailable', async () => {
      (datasetProfileService.profileDataset as jest.Mock).mockRejectedValueOnce(
        new ProfilerUnavailableError('unreachable')
      );

      const res = await request(app)
        .post('/api/v1/datasets/profile')
        .attach('file', dummyCsvPath, 'test.csv');

      expect(res.status).toBe(503);
      const calledPath = (datasetProfileService.profileDataset as jest.Mock).mock.calls[0][0];
      expect(fs.existsSync(calledPath)).toBe(false);
    });

    it('should return 504 and cleanup if profiler times out', async () => {
      (datasetProfileService.profileDataset as jest.Mock).mockRejectedValueOnce(
        new ProfilerTimeoutError('timeout')
      );

      const res = await request(app)
        .post('/api/v1/datasets/profile')
        .attach('file', dummyCsvPath, 'test.csv');

      expect(res.status).toBe(504);
      const calledPath = (datasetProfileService.profileDataset as jest.Mock).mock.calls[0][0];
      expect(fs.existsSync(calledPath)).toBe(false);
    });

    it('should return 502 and cleanup if profiler returns invalid response', async () => {
      (datasetProfileService.profileDataset as jest.Mock).mockRejectedValueOnce(
        new ProfilerInvalidResponseError('invalid')
      );

      const res = await request(app)
        .post('/api/v1/datasets/profile')
        .attach('file', dummyCsvPath, 'test.csv');

      expect(res.status).toBe(502);
      const calledPath = (datasetProfileService.profileDataset as jest.Mock).mock.calls[0][0];
      expect(fs.existsSync(calledPath)).toBe(false);
    });
  });

  describe('GET /api/v1/datasets', () => {
    it('returns lightweight summaries without the complete report', async () => {
      const res = await request(app).get('/api/v1/datasets');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'dataset-id', originalFilename: 'test.csv', createdAt: '2026-01-01T00:00:00.000Z', healthScore: 85, profilerVersion: 'testpilot-profiler-v1' }]);
    });
  });

  describe('GET /api/v1/datasets/:id', () => {
    it('returns the persisted dataset by ID', async () => {
      const res = await request(app).get('/api/v1/datasets/dataset-id');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('dataset-id');
      expect(res.body.report).toBeDefined();
    });

    it('returns 404 for an unknown ID', async () => {
      (datasetProfileService.findById as jest.Mock).mockResolvedValueOnce(null);
      (datasetProfileService.getDatasetRecord as jest.Mock).mockResolvedValueOnce(null);
      const res = await request(app).get('/api/v1/datasets/missing');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Dataset not found');
    });
  });

  describe('GET /api/v1/datasets/:id/ai-context', () => {
    it('returns 200 and AI report context for a valid dataset ID', async () => {
      const res = await request(app).get('/api/v1/datasets/dataset-id/ai-context');
      expect(res.status).toBe(200);
      expect(res.body.datasetId).toBe('dataset-id');
      expect(res.body.id).toBe('dataset-id');
      expect(res.body.originalFilename).toBe('test.csv');
      expect(res.body.healthScore).toBe(85);
      expect(res.body.profilerVersion).toBe('testpilot-profiler-v1');
      expect(res.body.severityTotals).toBeDefined();
      expect(res.body.findings).toBeDefined();
      expect(res.body.columnProfiles).toBeDefined();
    });

    it('does not expose internal or sensitive fields like storedFilename', async () => {
      const res = await request(app).get('/api/v1/datasets/dataset-id/ai-context');
      expect(res.status).toBe(200);
      expect(res.body.storedFilename).toBeUndefined();
      expect(res.body.stored_filename).toBeUndefined();
      expect(res.body.filePath).toBeUndefined();
      expect(res.body.report).toBeUndefined();
    });

    it('returns 404 for an unknown dataset ID', async () => {
      (datasetProfileService.findById as jest.Mock).mockResolvedValueOnce(null);
      const res = await request(app).get('/api/v1/datasets/nonexistent/ai-context');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Dataset not found' });
    });
  });

  describe('DELETE /api/v1/datasets/:id', () => {
    it('deletes dataset when found', async () => {
      (datasetProfileService.deleteDataset as jest.Mock).mockResolvedValueOnce(true);

      const res = await request(app).delete('/api/v1/datasets/dataset-id');
      expect(res.status).toBe(200);
    });

    it('returns 404 for a nonexistent dataset', async () => {
      (datasetProfileService.deleteDataset as jest.Mock).mockResolvedValueOnce(false);

      const res = await request(app).delete('/api/v1/datasets/missing');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Dataset not found' });
    });
  });
});
