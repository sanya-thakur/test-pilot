import { ProfilerResponseV1 } from '../contracts/profiler-response';

export interface DatasetRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSha256: string;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  encoding: string;
  delimiter: string;
  headerQuality: string;
  healthScore: number;
  healthScoreDeductions: Record<string, number>;
  scoringVersion: string;
  severityTotals: { info: number; warning: number; error: number };
  findings: any[];
  columnProfiles: any[];
  profilerVersion: string;
  report: ProfilerResponseV1;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetSummary {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSha256: string;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  healthScore: number;
  createdAt: Date;
}

export interface CreateDatasetInput {
  originalFilename: string;
  storedFilename: string;
  report: ProfilerResponseV1;
}

export interface IDatasetRepository {
  create(input: CreateDatasetInput): Promise<DatasetRecord>;
  findById(id: string): Promise<DatasetRecord | null>;
  list(): Promise<DatasetSummary[]>;
  delete(id: string): Promise<boolean>;
}
