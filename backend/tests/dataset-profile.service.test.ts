import { datasetProfileService, DatasetProfileService } from '../src/services/dataset-profile.service';
import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';
import type { DatasetRepository } from '../src/repositories/dataset.repository';

jest.mock('../src/clients/fastapi-profiler.client');

describe('DatasetProfileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call profilerClient.profile with the correct file path', async () => {
    const mockProfile = jest.fn().mockResolvedValue({ health_score: 100 });
    // @ts-ignore
    FastAPIProfilerClient.mockImplementation(() => {
      return { profile: mockProfile };
    });

    // Re-instantiate the service to pick up the mock
    const { DatasetProfileService } = require('../src/services/dataset-profile.service');
    const service = new DatasetProfileService();

    const result = await service.profileDataset('test-path.csv');
    expect(mockProfile).toHaveBeenCalledWith('test-path.csv');
    expect(result).toEqual({ health_score: 100 });
  });

  it('persists a successful validated profile', async () => {
    const report = {
      profiler_version: 'testpilot-profiler-v1',
      health_score: { score: 85 },
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
