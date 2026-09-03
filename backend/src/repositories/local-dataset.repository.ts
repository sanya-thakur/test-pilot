import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { DatasetRecord, DatasetRepository, DatasetSummary } from './dataset.repository';

const DEFAULT_STORAGE_PATH = path.resolve(__dirname, '../../..', 'data/datasets/datasets.json');

export class LocalDatasetRepository implements DatasetRepository {
  private readonly storagePath: string;

  constructor(storagePath = process.env.DATASET_STORAGE_PATH || DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
  }

  async create(dataset: Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>): Promise<DatasetRecord> {
    const datasets = await this.readDatasets();
    const record: DatasetRecord = {
      ...dataset,
      id: dataset.id || crypto.randomUUID(),
      createdAt: dataset.createdAt || new Date().toISOString(),
    };

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
    return datasets.map(({ id, originalFilename, createdAt, healthScore, profilerVersion }) => ({
      id,
      originalFilename,
      createdAt,
      healthScore,
      profilerVersion,
    }));
  }

  private async readDatasets(): Promise<DatasetRecord[]> {
    try {
      const contents = await fs.readFile(this.storagePath, 'utf8');
      const parsed: unknown = JSON.parse(contents);
      return Array.isArray(parsed) ? parsed as DatasetRecord[] : [];
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