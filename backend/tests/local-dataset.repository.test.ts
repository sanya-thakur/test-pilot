import fs from 'fs';
import path from 'path';
import { LocalDatasetRepository } from '../src/repositories/local-dataset.repository';
import { ProfilerResponseV1 } from '../src/contracts/profiler-response';

describe('LocalDatasetRepository', () => {
  const testDbPath = path.resolve(__dirname, 'tmp-datasets.json');
  let repository: LocalDatasetRepository;

  const mockReport: ProfilerResponseV1 = {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: {
      file_sha256: 'sha256_mock_123',
      size_bytes: 512,
      row_count: 20,
      column_count: 5,
      duplicate_row_count: 1,
      encoding: 'utf-8',
      delimiter: ',',
      header_quality: 'good',
    },
    health_score: {
      score: 95,
      deductions: { DUP_ROWS: 5 },
      scoring_version: 'score-v1',
    },
    severity_totals: { info: 1, warning: 1, error: 0 },
    findings: [
      {
        rule_id: 'DUP_ROWS',
        severity: 'warning',
        column: null,
        metrics: { count: 1 },
      },
    ],
    column_profiles: [],
  };

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    repository = new LocalDatasetRepository(testDbPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('creates, lists, finds, and deletes dataset records locally', async () => {
    const created = await repository.create({
      originalFilename: 'sales.csv',
      storedFilename: 'sales-123.csv',
      report: mockReport,
    });

    expect(created.id).toBeDefined();
    expect(created.originalFilename).toBe('sales.csv');
    expect(created.healthScore).toBe(95);

    const list = await repository.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].originalFilename).toBe('sales.csv');

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.fileSha256).toBe('sha256_mock_123');

    const deleted = await repository.delete(created.id);
    expect(deleted).toBe(true);

    const listAfterDelete = await repository.list();
    expect(listAfterDelete).toHaveLength(0);

    const deleteNonExistent = await repository.delete('non-existent-id');
    expect(deleteNonExistent).toBe(false);
  });
});
