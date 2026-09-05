import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  DatasetRecord,
  DatasetSummary,
  CreateDatasetInput,
  IDatasetRepository,
} from './dataset.repository';

export class LocalDatasetRepository implements IDatasetRepository {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath || path.resolve(process.cwd(), 'data', 'datasets', 'datasets.json');
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readRecords(): DatasetRecord[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    } catch {
      return [];
    }
  }

  private writeRecords(records: DatasetRecord[]): void {
    this.ensureDirectory();
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  async create(input: CreateDatasetInput): Promise<DatasetRecord> {
    const records = this.readRecords();
    const now = new Date();

    const record: DatasetRecord = {
      id: randomUUID(),
      originalFilename: input.originalFilename,
      storedFilename: input.storedFilename,
      fileSha256: input.report.file_summary.file_sha256,
      sizeBytes: input.report.file_summary.size_bytes,
      rowCount: input.report.file_summary.row_count,
      columnCount: input.report.file_summary.column_count,
      duplicateRowCount: input.report.file_summary.duplicate_row_count,
      encoding: input.report.file_summary.encoding,
      delimiter: input.report.file_summary.delimiter,
      headerQuality: input.report.file_summary.header_quality,
      healthScore: input.report.health_score.score,
      healthScoreDeductions: input.report.health_score.deductions,
      scoringVersion: input.report.health_score.scoring_version,
      severityTotals: input.report.severity_totals,
      findings: input.report.findings,
      columnProfiles: input.report.column_profiles,
      profilerVersion: input.report.profiler_version,
      report: input.report,
      createdAt: now,
      updatedAt: now,
    };

    records.push(record);
    this.writeRecords(records);
    return record;
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    const records = this.readRecords();
    const record = records.find((r) => r.id === id);
    return record || null;
  }

  async list(): Promise<DatasetSummary[]> {
    const records = this.readRecords();
    return records.map((r) => ({
      id: r.id,
      originalFilename: r.originalFilename,
      storedFilename: r.storedFilename,
      fileSha256: r.fileSha256,
      sizeBytes: r.sizeBytes,
      rowCount: r.rowCount,
      columnCount: r.columnCount,
      healthScore: r.healthScore,
      createdAt: r.createdAt,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const records = this.readRecords();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) {
      return false;
    }
    records.splice(index, 1);
    this.writeRecords(records);
    return true;
  }
}
