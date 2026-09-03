import type { ProfilerResponseV1 } from '../contracts/profiler-response';

export interface DatasetRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  createdAt: string;
  profilerVersion: string;
  healthScore: number;
  report: ProfilerResponseV1;
}

export interface DatasetSummary {
  id: string;
  originalFilename: string;
  createdAt: string;
  healthScore: number;
  profilerVersion: string;
}

export interface DatasetRepository {
  create(dataset: Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>): Promise<DatasetRecord>;
  findById(id: string): Promise<DatasetRecord | null>;
  list(): Promise<DatasetSummary[]>;
}