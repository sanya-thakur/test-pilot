import { PostgresDatasetRepository } from '../src/repositories/postgres-dataset.repository';
import { ProfilerResponseV1 } from '../src/contracts/profiler-response';

describe('PostgresDatasetRepository (Unit / Mocked)', () => {
  let mockPrisma: any;
  let repository: PostgresDatasetRepository;

  const mockReport: ProfilerResponseV1 = {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: {
      file_sha256: 'sha256_pg_456',
      size_bytes: 1024,
      row_count: 50,
      column_count: 8,
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

  const mockDbRecord = {
    id: 'uuid-pg-1',
    originalFilename: 'orders.csv',
    storedFilename: 'orders-456.csv',
    fileSha256: 'sha256_pg_456',
    sizeBytes: BigInt(1024),
    rowCount: 50,
    columnCount: 8,
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
    createdAt: new Date('2026-09-05T10:00:00Z'),
    updatedAt: new Date('2026-09-05T10:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      datasetRecord: {
        create: jest.fn().mockResolvedValue(mockDbRecord),
        findUnique: jest.fn().mockResolvedValue(mockDbRecord),
        findMany: jest.fn().mockResolvedValue([mockDbRecord]),
        delete: jest.fn().mockResolvedValue(mockDbRecord),
      },
    };
    repository = new PostgresDatasetRepository(mockPrisma);
  });

  it('maps created database records correctly to DatasetRecord', async () => {
    const result = await repository.create({
      originalFilename: 'orders.csv',
      storedFilename: 'orders-456.csv',
      report: mockReport,
    });

    expect(mockPrisma.datasetRecord.create).toHaveBeenCalled();
    expect(result.id).toBe('uuid-pg-1');
    expect(result.sizeBytes).toBe(1024);
    expect(result.originalFilename).toBe('orders.csv');
  });

  it('maps findById correctly', async () => {
    const result = await repository.findById('uuid-pg-1');
    expect(mockPrisma.datasetRecord.findUnique).toHaveBeenCalledWith({
      where: { id: 'uuid-pg-1' },
    });
    expect(result?.id).toBe('uuid-pg-1');
    expect(result?.healthScore).toBe(100);
  });

  it('maps list records to DatasetSummary array', async () => {
    const list = await repository.list();
    expect(mockPrisma.datasetRecord.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('uuid-pg-1');
  });

  it('deletes record correctly', async () => {
    const success = await repository.delete('uuid-pg-1');
    expect(mockPrisma.datasetRecord.delete).toHaveBeenCalledWith({
      where: { id: 'uuid-pg-1' },
    });
    expect(success).toBe(true);
  });
});
