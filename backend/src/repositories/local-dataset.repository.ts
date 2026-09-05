import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { DatasetRecord, DatasetRepository, DatasetSummary, CreateDatasetInput } from './dataset.repository';

const DEFAULT_STORAGE_PATH = path.resolve(__dirname, '../../..', 'data/datasets/datasets.json');

export class LocalDatasetRepository implements DatasetRepository {
  private readonly storagePath: string;

  constructor(storagePath = process.env.DATASET_STORAGE_PATH || DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
  }

  async create(input: CreateDatasetInput | (Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>)): Promise<DatasetRecord> {
    const datasets = await this.readDatasets();

    let record: DatasetRecord;
    if ('report' in input && input.report && !('healthScore' in input)) {
      const report = input.report;
      record = {
        id: crypto.randomUUID(),
        originalFilename: input.originalFilename,
        storedFilename: input.storedFilename,
        createdAt: new Date().toISOString(),
        profilerVersion: report.profiler_version,
        healthScore: report.health_score.score,
        report: report,
        fileSha256: report.file_summary.file_sha256,
        sizeBytes: report.file_summary.size_bytes,
        rowCount: report.file_summary.row_count,
        columnCount: report.file_summary.column_count,
        duplicateRowCount: report.file_summary.duplicate_row_count,
        encoding: report.file_summary.encoding,
        delimiter: report.file_summary.delimiter,
        headerQuality: report.file_summary.header_quality,
        healthScoreDeductions: report.health_score.deductions,
        scoringVersion: report.health_score.scoring_version,
        severityTotals: report.severity_totals,
        findings: report.findings,
        columnProfiles: report.column_profiles,
      };
    } else {
      const inputRecord = input as Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>;
      record = {
        ...inputRecord,
        id: inputRecord.id || crypto.randomUUID(),
        createdAt: inputRecord.createdAt || new Date().toISOString(),
      };
    }

    datasets.push(record);
    await this.writeDatasets(datasets);
    return record;
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    const datasets = await this.readDatasets();
    return datasets.find((dataset) => dataset.id === id) || null;
  }

  async list(): Promise<DatasetSummary[]> {
    const datasets = await this.readDatasets();
    return datasets.map((d) => ({
      id: d.id,
      originalFilename: d.originalFilename,
      createdAt: d.createdAt,
      healthScore: d.healthScore,
      profilerVersion: d.profilerVersion,
      storedFilename: d.storedFilename,
      fileSha256: d.fileSha256,
      sizeBytes: d.sizeBytes,
      rowCount: d.rowCount,
      columnCount: d.columnCount,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const datasets = await this.readDatasets();
    const index = datasets.findIndex((dataset) => dataset.id === id);

    if (index === -1) {
      return false;
    }

    datasets.splice(index, 1);
    await this.writeDatasets(datasets);
    return true;
  }

  private async readDatasets(): Promise<DatasetRecord[]> {
    try {
      const contents = await fs.readFile(this.storagePath, 'utf8');
      const parsed: unknown = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as DatasetRecord[]) : [];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.writeDatasets([]);
        return [];
      }
      throw error;
    }
  }

  private async writeDatasets(datasets: DatasetRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(datasets, null, 2), 'utf8');
  }
}
