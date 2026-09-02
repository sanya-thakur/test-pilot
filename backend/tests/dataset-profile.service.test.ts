import { datasetProfileService } from '../src/services/dataset-profile.service';
import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';

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
});
