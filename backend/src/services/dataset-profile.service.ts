import { FastAPIProfilerClient } from '../clients/fastapi-profiler.client';

export class DatasetProfileService {
  private profilerClient: FastAPIProfilerClient;

  constructor() {
    this.profilerClient = new FastAPIProfilerClient();
  }

  async profileDataset(filePath: string): Promise<any> {
    return this.profilerClient.profile(filePath);
  }
}

export const datasetProfileService = new DatasetProfileService();
