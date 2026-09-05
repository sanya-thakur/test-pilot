import { DatasetProfileService } from '../src/services/dataset-profile.service';
import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';
import { IDatasetRepository } from '../src/repositories/dataset.repository';

jest.mock('../src/clients/fastapi-profiler.client');

describe('DatasetProfileService', () => {
  let mockRepo: jest.Mocked<IDatasetRepository>;
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
        fileSha256: 'abc123sha',
        sizeBytes: 100,
        rowCount: 10,
        columnCount: 2,
        duplicateRowCount: 0,
        encoding: 'utf-8',
        delimiter: ',',
        headerQuality: 'good',
        healthScore: 100,
        healthScoreDeductions: {},
        scoringVersion: 'score-v1',
        severityTotals: { info: 0, warning: 0, error: 0 },
        findings: [],
        columnProfiles: [],
        profilerVersion: 'testpilot-profiler-v1',
        report: mockReport,
        createdAt: new Date(),
        updatedAt: new Date(),
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
    const service = new DatasetProfileService(mockRepo, mockProfilerClient);

    const result = await service.profileDataset('test-path.csv', 'original-test.csv');
    expect(mockProfilerClient.profile).toHaveBeenCalledWith('test-path.csv');
    expect(mockRepo.create).toHaveBeenCalledWith({
      originalFilename: 'original-test.csv',
      storedFilename: 'test-path.csv',
      report: mockReport,
    });
    expect(result).toEqual(mockReport);
  });

  it('should delegate findById to repository', async () => {
    const service = new DatasetProfileService(mockRepo, mockProfilerClient);
    mockRepo.findById.mockResolvedValueOnce({ id: 'record-1' } as any);

    const result = await service.getDatasetRecord('record-1');
    expect(mockRepo.findById).toHaveBeenCalledWith('record-1');
    expect(result).toEqual({ id: 'record-1' });
  });

  it('should delegate list to repository', async () => {
    const service = new DatasetProfileService(mockRepo, mockProfilerClient);
    mockRepo.list.mockResolvedValueOnce([{ id: 'record-1' }] as any);

    const result = await service.listDatasets();
    expect(mockRepo.list).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'record-1' }]);
  });

  it('should delegate delete to repository', async () => {
    const service = new DatasetProfileService(mockRepo, mockProfilerClient);
    mockRepo.delete.mockResolvedValueOnce(true);

    const result = await service.deleteDataset('record-1');
    expect(mockRepo.delete).toHaveBeenCalledWith('record-1');
    expect(result).toBe(true);
  });
});
