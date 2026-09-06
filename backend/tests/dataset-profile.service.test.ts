import { DatasetProfileService } from '../src/services/dataset-profile.service';
import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';
import type { DatasetRepository } from '../src/repositories/dataset.repository';

jest.mock('../src/clients/fastapi-profiler.client');

describe('DatasetProfileService', () => {
  let mockRepo: jest.Mocked<DatasetRepository>;
  let mockProfilerClient: jest.Mocked<FastAPIProfilerClient>;

  const mockReport: any = {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: {
      file_sha256: 'abc123sha',
      size_bytes: 100,
      row_count: 10,
      column_count: 2,
      duplicate_row_count: 0,
      encoding: 'utf-8',
      delimiter: ',',
      header_quality: 'good',
    },
    health_score: {
      score: 100,
      deductions: {},
      scoring_version: 'score-v1',
    },
    severity_totals: { info: 0, warning: 0, error: 0 },
    findings: [],
    column_profiles: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = {
      create: jest.fn().mockResolvedValue({
        id: 'record-1',
        originalFilename: 'test.csv',
        storedFilename: 'test.csv',
        createdAt: '2026-09-05T10:00:00Z',
        healthScore: 100,
        profilerVersion: 'testpilot-profiler-v1',
        report: mockReport,
      }),
      findById: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
    };

    mockProfilerClient = {
      profile: jest.fn().mockResolvedValue(mockReport),
    } as any;
  });

  it('should call profilerClient.profile with the correct file path and save record', async () => {
    const service = new DatasetProfileService(mockProfilerClient, mockRepo);

    const result = await service.profileDataset('test-path.csv', 'original-test.csv');
    expect(mockProfilerClient.profile).toHaveBeenCalledWith('test-path.csv');
    expect(mockRepo.create).toHaveBeenCalled();
    expect(result).toEqual({ ...mockReport, datasetId: 'record-1' });
  });

  it('should delegate findById to repository', async () => {
    const service = new DatasetProfileService(mockProfilerClient, mockRepo);
    mockRepo.findById.mockResolvedValueOnce({ id: 'record-1' } as any);

    const result = await service.getDatasetRecord('record-1');
    expect(mockRepo.findById).toHaveBeenCalledWith('record-1');
    expect(result).toEqual({ id: 'record-1' });
  });

  it('should delegate list to repository', async () => {
    const service = new DatasetProfileService(mockProfilerClient, mockRepo);
    mockRepo.list.mockResolvedValueOnce([{ id: 'record-1' }] as any);

    const result = await service.listDatasets();
    expect(mockRepo.list).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'record-1' }]);
  });

  it('should delegate delete to repository', async () => {
    const service = new DatasetProfileService(mockProfilerClient, mockRepo);
    mockRepo.delete.mockResolvedValueOnce(true);

    const result = await service.deleteDataset('record-1');
    expect(mockRepo.delete).toHaveBeenCalledWith('record-1');
    expect(result).toBe(true);
  });

  it('persists a successful validated profile', async () => {
    const report = {
      profiler_version: 'testpilot-profiler-v1',
      file_summary: { file_sha256: 'a', size_bytes: 1, row_count: 1, column_count: 1, duplicate_row_count: 0, encoding: 'u', delimiter: ',', header_quality: 'good' },
      health_score: { score: 85, deductions: {}, scoring_version: 'v1' },
      severity_totals: { info: 0, warning: 0, error: 0 },
      findings: [],
      column_profiles: [],
    } as any;
    const profile = jest.fn().mockResolvedValue(report);
    const create = jest.fn().mockResolvedValue({ id: 'dataset-id' });
    const repository = { create } as unknown as DatasetRepository;
    const service = new DatasetProfileService({ profile } as any, repository);

    const result = await service.profileDataset('test-path.csv', {
      originalFilename: 'original.csv',
      storedFilename: 'stored.csv',
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      originalFilename: 'original.csv',
      storedFilename: 'stored.csv',
      report,
      healthScore: 85,
    }));
    expect(result).toEqual({ ...report, datasetId: 'dataset-id' });
  });

  it('does not persist when profiling fails or returns an invalid response', async () => {
    const create = jest.fn();
    const repository = { create } as unknown as DatasetRepository;
    const failingService = new DatasetProfileService({ profile: jest.fn().mockRejectedValue(new Error('failure')) } as any, repository);
    await expect(failingService.profileDataset('test-path.csv', { originalFilename: 'a.csv', storedFilename: 'b.csv' })).rejects.toThrow('failure');

    const invalidService = new DatasetProfileService({ profile: jest.fn().mockRejectedValue(new Error('invalid response')) } as any, repository);
    await expect(invalidService.profileDataset('test-path.csv', { originalFilename: 'a.csv', storedFilename: 'b.csv' })).rejects.toThrow('invalid response');
    expect(create).not.toHaveBeenCalled();
  });

  it('deletes datasets through the repository', async () => {
    const repository = { delete: jest.fn().mockResolvedValue(true) } as unknown as DatasetRepository;
    const service = new DatasetProfileService({ profile: jest.fn() } as any, repository);

    await expect(service.deleteDataset('dataset-id')).resolves.toBe(true);
    expect(repository.delete).toHaveBeenCalledWith('dataset-id');
  });

  it('returns not-found deletion results from the repository', async () => {
    const repository = { delete: jest.fn().mockResolvedValue(false) } as unknown as DatasetRepository;
    const service = new DatasetProfileService({ profile: jest.fn() } as any, repository);

    await expect(service.deleteDataset('missing-id')).resolves.toBe(false);
  });
});
