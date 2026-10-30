import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { ProjectRecord, ProjectRepository } from './project.repository';

const DEFAULT_STORAGE_PATH = path.resolve(__dirname, '../../..', 'data/projects/projects.json');

export class LocalProjectRepository implements ProjectRepository {
  constructor(private readonly storagePath = process.env.PROJECT_STORAGE_PATH || DEFAULT_STORAGE_PATH) {}

  async create(input: Omit<ProjectRecord, 'id' | 'createdAt'>): Promise<ProjectRecord> {
    const records = await this.read();
    const record: ProjectRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    records.push(record);
    await this.write(records);
    return record;
  }

  async list(): Promise<ProjectRecord[]> { return this.read(); }
  async findById(id: string): Promise<ProjectRecord | null> { return (await this.read()).find((project) => project.id === id) || null; }
  async delete(id: string): Promise<ProjectRecord | null> {
    const records = await this.read();
    const index = records.findIndex((project) => project.id === id);
    if (index < 0) return null;
    const [deleted] = records.splice(index, 1);
    await this.write(records);
    return deleted;
  }

  private async read(): Promise<ProjectRecord[]> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.storagePath, 'utf8'));
      return Array.isArray(parsed) ? parsed as ProjectRecord[] : [];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(records: ProjectRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(records, null, 2), 'utf8');
  }
}
