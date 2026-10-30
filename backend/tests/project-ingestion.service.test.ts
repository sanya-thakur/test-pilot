import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import yazl from 'yazl';
import { ProjectIngestionService } from '../src/services/project-ingestion.service';
import type { ProjectRecord, ProjectRepository } from '../src/repositories/project.repository';

class MemoryProjects implements ProjectRepository {
  public records: ProjectRecord[] = [];
  async create(input: Omit<ProjectRecord, 'id' | 'createdAt'>): Promise<ProjectRecord> {
    const record = { ...input, id: 'project-1', createdAt: '2026-10-29T00:00:00.000Z' };
    this.records.push(record); return record;
  }
  async list(): Promise<ProjectRecord[]> { return this.records; }
  async findById(id: string): Promise<ProjectRecord | null> { return this.records.find((record) => record.id === id) || null; }
  async delete(id: string): Promise<ProjectRecord | null> { const index = this.records.findIndex((record) => record.id === id); return index < 0 ? null : this.records.splice(index, 1)[0]; }
}

const writeZip = (filename: string, entries: Record<string, string>): Promise<void> => new Promise((resolve, reject) => {
  const zip = new yazl.ZipFile();
  Object.entries(entries).forEach(([name, body]) => zip.addBuffer(Buffer.from(body), name));
  zip.outputStream.pipe(require('fs').createWriteStream(filename)).on('close', resolve).on('error', reject);
  zip.end();
});

describe('ProjectIngestionService', () => {
  let temporaryDirectory: string;
  beforeEach(async () => { temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'testpilot-project-')); });
  afterEach(async () => { await fs.rm(temporaryDirectory, { recursive: true, force: true }); });

  it('safely extracts and inventories supported source files without executing them', async () => {
    const archive = path.join(temporaryDirectory, 'example.zip');
    await new Promise<void>((resolve, reject) => {
      const zip = new yazl.ZipFile();
      zip.addEmptyDirectory('src/');
      zip.addBuffer(Buffer.from('{"name":"example"}'), 'package.json');
      zip.addBuffer(Buffer.from('export const route = true;'), 'src/routes/users.route.ts');
      zip.addBuffer(Buffer.from('model User { id String @id }'), 'prisma/schema.prisma');
      zip.addBuffer(Buffer.from('test("x", () => {})'), 'src/app.test.ts');
      zip.addBuffer(Buffer.from('export default {}'), 'vite.config.ts');
      zip.addBuffer(Buffer.from('FROM node:22'), 'Dockerfile');
      zip.addBuffer(Buffer.from('should not be extracted'), 'node_modules/example/index.js');
      zip.addBuffer(Buffer.from('secret=do-not-store'), '.env');
      zip.addBuffer(Buffer.from('binary-like'), 'public/logo.png');
      zip.outputStream.pipe(require('fs').createWriteStream(archive)).on('close', resolve).on('error', reject);
      zip.end();
    });
    const repository = new MemoryProjects();
    const service = new ProjectIngestionService(repository, path.join(temporaryDirectory, 'extracted'));
    const project = await service.ingest(archive, 'example.zip');

    expect(project.fileCount).toBe(6);
    expect(project.languages).toEqual(['Prisma', 'TypeScript']);
    expect(project.frameworks).toContain('Vite');
    expect(project.manifests).toEqual(['package.json']);
    expect(project.routes).toEqual(['src/routes/users.route.ts']);
    expect(project.schemas).toEqual(['prisma/schema.prisma']);
    expect(project.tests).toEqual(['src/app.test.ts']);
    expect(project.files.map((file) => file.path)).toEqual([...project.files.map((file) => file.path)].sort());
    expect(project.files.map((file) => file.path)).not.toContain('node_modules/example/index.js');
    expect(project.files.map((file) => file.path)).not.toContain('.env');
    expect(project.files.map((file) => file.path)).not.toContain('public/logo.png');
  });
});
