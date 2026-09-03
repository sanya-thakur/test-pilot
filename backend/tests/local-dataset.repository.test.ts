import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LocalDatasetRepository } from '../src/repositories/local-dataset.repository';
import type { ProfilerResponseV1 } from '../src/contracts/profiler-response';

describe('LocalDatasetRepository', () => {
  let temporaryDirectory: string;
  let repository: LocalDatasetRepository;
  const report = {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: { file_sha256: 'hash', size_bytes: 10, row_count: 1, column_count: 1, duplicate_row_count: 0, encoding: 'utf-8', delimiter: ',', header_quality: 'good' },
    health_score: { score: 90, deductions: {}, scoring_version: 'score-v1' },
    severity_totals: { info: 0, warning: 0, error: 0 },
    findings: [],
    column_profiles: [],
  } satisfies ProfilerResponseV1;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'testpilot-datasets-'));
    repository = new LocalDatasetRepository(path.join(temporaryDirectory, 'nested', 'datasets.json'));
  });

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('initializes missing storage and creates a dataset with a UUID', async () => {
    const dataset = await repository.create({
      originalFilename: 'input.csv',
      storedFilename: 'generated.csv',
      profilerVersion: report.profiler_version,
      healthScore: report.health_score.score,
      report,
    });

    expect(dataset.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(fs.access(path.join(temporaryDirectory, 'nested', 'datasets.json'))).resolves.toBeUndefined();
  });

  it('retrieves existing datasets, returns null for missing IDs, and lists summaries', async () => {
    const created = await repository.create({
      originalFilename: 'input.csv',
      storedFilename: 'generated.csv',
      profilerVersion: report.profiler_version,
      healthScore: report.health_score.score,
      report,
    });

    await expect(repository.findById(created.id)).resolves.toEqual(created);
    await expect(repository.findById('missing')).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([{
      id: created.id,
      originalFilename: 'input.csv',
      createdAt: created.createdAt,
      healthScore: 90,
      profilerVersion: 'testpilot-profiler-v1',
    }]);
  });

  it('deletes an existing dataset and preserves other datasets', async () => {
    const first = await repository.create({
      originalFilename: 'first.csv', storedFilename: 'first-safe.csv',
      profilerVersion: report.profiler_version, healthScore: report.health_score.score, report,
    });
    const second = await repository.create({
      originalFilename: 'second.csv', storedFilename: 'second-safe.csv',
      profilerVersion: report.profiler_version, healthScore: report.health_score.score, report,
    });

    await expect(repository.delete(first.id)).resolves.toBe(true);
    await expect(repository.findById(first.id)).resolves.toBeNull();
    await expect(repository.findById(second.id)).resolves.toEqual(second);
    await expect(repository.delete('missing')).resolves.toBe(false);
  });

  it('deleting the final dataset leaves valid empty storage', async () => {
    const dataset = await repository.create({
      originalFilename: 'only.csv', storedFilename: 'only-safe.csv',
      profilerVersion: report.profiler_version, healthScore: report.health_score.score, report,
    });

    await expect(repository.delete(dataset.id)).resolves.toBe(true);
    await expect(repository.list()).resolves.toEqual([]);
    await expect(fs.readFile(path.join(temporaryDirectory, 'nested', 'datasets.json'), 'utf8'))
      .resolves.toBe('[]');
  });
});