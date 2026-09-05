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
    listDatasets: jest.fn(),
    getDatasetRecord: jest.fn(),
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
    (datasetProfileService.profileDataset as jest.Mock).mockResolvedValue({ health_score: 85 });
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
    it('should return a list of datasets', async () => {
      (datasetProfileService.listDatasets as jest.Mock).mockResolvedValueOnce([
        { id: '1', originalFilename: 'test.csv' },
      ]);

      const res = await request(app).get('/api/v1/datasets');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: '1', originalFilename: 'test.csv' }]);
    });
  });

  describe('GET /api/v1/datasets/:id', () => {
    it('should return dataset details when found', async () => {
      (datasetProfileService.getDatasetRecord as jest.Mock).mockResolvedValueOnce({
        id: '1',
        originalFilename: 'test.csv',
      });

      const res = await request(app).get('/api/v1/datasets/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: '1', originalFilename: 'test.csv' });
    });

    it('should return 404 when dataset is not found', async () => {
      (datasetProfileService.getDatasetRecord as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/v1/datasets/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Dataset not found');
    });
  });

  describe('DELETE /api/v1/datasets/:id', () => {
    it('should delete dataset when found', async () => {
      (datasetProfileService.deleteDataset as jest.Mock).mockResolvedValueOnce(true);

      const res = await request(app).delete('/api/v1/datasets/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Dataset deleted successfully');
    });

    it('should return 404 when deleting non-existent dataset', async () => {
      (datasetProfileService.deleteDataset as jest.Mock).mockResolvedValueOnce(false);

      const res = await request(app).delete('/api/v1/datasets/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Dataset not found');
    });
  });
});
