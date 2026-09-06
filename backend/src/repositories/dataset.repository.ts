import type { ProfilerResponseV1 } from '../contracts/profiler-response';

export interface DatasetRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  createdAt: string;
  profilerVersion: string;
  healthScore: number;
  report: ProfilerResponseV1;
  fileSha256?: string;
  sizeBytes?: number;
  rowCount?: number;
  columnCount?: number;
  duplicateRowCount?: number;
  encoding?: string;
  delimiter?: string;
  headerQuality?: string;
  healthScoreDeductions?: Record<string, number>;
  scoringVersion?: string;
  severityTotals?: { info: number; warning: number; error: number };
  findings?: any[];
  columnProfiles?: any[];
  updatedAt?: string | Date;
}

export interface DatasetSummary {
  id: string;
  originalFilename: string;
  createdAt: string;
  healthScore: number;
  profilerVersion: string;
  storedFilename?: string;
  fileSha256?: string;
  sizeBytes?: number;
  rowCount?: number;
  columnCount?: number;
}

export interface CreateDatasetInput {
  originalFilename: string;
  storedFilename: string;
  report: ProfilerResponseV1;
  id?: string;
  createdAt?: string;
  profilerVersion?: string;
  healthScore?: number;
}

export interface DatasetRepository {
  create(dataset: CreateDatasetInput | (Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>)): Promise<DatasetRecord>;
  findById(id: string): Promise<DatasetRecord | null>;
  list(): Promise<DatasetSummary[]>;
  delete(id: string): Promise<boolean>;
}

export type IDatasetRepository = DatasetRepository;
