import { FastAPIProfilerClient } from '../clients/fastapi-profiler.client';
import type { DatasetRecord, DatasetRepository } from '../repositories/dataset.repository';
import { LocalDatasetRepository } from '../repositories/local-dataset.repository';
import type { ProfilerResponseV1 } from '../contracts/profiler-response';

export interface DatasetUploadMetadata {
  originalFilename: string;
  storedFilename: string;
}

export type ProfiledDatasetResponse = ProfilerResponseV1 & { datasetId: string };

export class DatasetProfileService {
  constructor(
    private readonly profilerClient: FastAPIProfilerClient = new FastAPIProfilerClient(),
    private readonly datasetRepository: DatasetRepository = new LocalDatasetRepository()
  ) {}

  async profileDataset(filePath: string, metadata?: DatasetUploadMetadata): Promise<ProfilerResponseV1 | ProfiledDatasetResponse> {
    const report = await this.profilerClient.profile(filePath);

    if (!metadata) {
      return report;
    }

    const dataset: DatasetRecord = await this.datasetRepository.create({
      originalFilename: metadata.originalFilename,
      storedFilename: metadata.storedFilename,
      profilerVersion: report.profiler_version,
      healthScore: report.health_score.score,
      report,
    });

    return { ...report, datasetId: dataset.id };
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    return this.datasetRepository.findById(id);
  }

  async list(): Promise<Awaited<ReturnType<DatasetRepository['list']>>> {
    return this.datasetRepository.list();
  }

  async deleteDataset(id: string): Promise<boolean> {
    return this.datasetRepository.delete(id);
  }
}

export const datasetProfileService = new DatasetProfileService();
