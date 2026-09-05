import path from 'path';
import { FastAPIProfilerClient } from '../clients/fastapi-profiler.client';
import { IDatasetRepository, DatasetRecord, DatasetSummary } from '../repositories/dataset.repository';
import { LocalDatasetRepository } from '../repositories/local-dataset.repository';
import { PostgresDatasetRepository } from '../repositories/postgres-dataset.repository';
import { ProfilerResponseV1 } from '../contracts/profiler-response';

export class DatasetProfileService {
  private profilerClient: FastAPIProfilerClient;
  private repository: IDatasetRepository;

  constructor(repository?: IDatasetRepository, profilerClient?: FastAPIProfilerClient) {
    this.profilerClient = profilerClient || new FastAPIProfilerClient();
    if (repository) {
      this.repository = repository;
    } else {
      const repoType = process.env.DATASET_REPOSITORY || 'local';
      this.repository =
        repoType === 'postgres'
          ? new PostgresDatasetRepository()
          : new LocalDatasetRepository();
    }
  }

  async profileDataset(filePath: string, originalFilename?: string): Promise<ProfilerResponseV1> {
    const report = await this.profilerClient.profile(filePath);
    const filename = originalFilename || path.basename(filePath);
    await this.repository.create({
      originalFilename: filename,
      storedFilename: path.basename(filePath),
      report,
    });
    return report;
  }

  async getDatasetRecord(id: string): Promise<DatasetRecord | null> {
    return this.repository.findById(id);
  }

  async listDatasets(): Promise<DatasetSummary[]> {
    return this.repository.list();
  }

  async deleteDataset(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  getRepository(): IDatasetRepository {
    return this.repository;
  }
}

export const datasetProfileService = new DatasetProfileService();
