import path from 'path';
import { FastAPIProfilerClient } from '../clients/fastapi-profiler.client';
import type { DatasetRecord, DatasetRepository, DatasetSummary } from '../repositories/dataset.repository';
import { LocalDatasetRepository } from '../repositories/local-dataset.repository';
import { PostgresDatasetRepository } from '../repositories/postgres-dataset.repository';
import type { ProfilerResponseV1 } from '../contracts/profiler-response';

export interface DatasetUploadMetadata {
  originalFilename: string;
  storedFilename: string;
}

export type ProfiledDatasetResponse = ProfilerResponseV1 & { datasetId?: string };

export class DatasetProfileService {
  private profilerClient: FastAPIProfilerClient;
  private datasetRepository: DatasetRepository;

  constructor(
    profilerClient?: FastAPIProfilerClient,
    datasetRepository?: DatasetRepository
  ) {
    this.profilerClient = profilerClient || new FastAPIProfilerClient();
    if (datasetRepository) {
      this.datasetRepository = datasetRepository;
    } else {
      const repoType = process.env.DATASET_REPOSITORY || 'local';
      this.datasetRepository =
        repoType === 'postgres'
          ? new PostgresDatasetRepository()
          : new LocalDatasetRepository();
    }
  }

  async profileDataset(
    filePath: string,
    metadataOrFilename?: DatasetUploadMetadata | string
  ): Promise<ProfilerResponseV1 | ProfiledDatasetResponse> {
    const report = await this.profilerClient.profile(filePath);

    let metadata: DatasetUploadMetadata | undefined;
    if (typeof metadataOrFilename === 'string') {
      metadata = {
        originalFilename: metadataOrFilename,
        storedFilename: path.basename(filePath),
      };
    } else if (metadataOrFilename) {
      metadata = metadataOrFilename;
    }

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

  async getDatasetRecord(id: string): Promise<DatasetRecord | null> {
    return this.findById(id);
  }

  async list(): Promise<DatasetSummary[]> {
    return this.datasetRepository.list();
  }

  async listDatasets(): Promise<DatasetSummary[]> {
    return this.list();
  }

  async deleteDataset(id: string): Promise<boolean> {
    return this.datasetRepository.delete(id);
  }

  getRepository(): DatasetRepository {
    return this.datasetRepository;
  }
}

export const datasetProfileService = new DatasetProfileService();
