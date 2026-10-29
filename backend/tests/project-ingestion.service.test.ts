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
    await writeZip(archive, {
      'package.json': '{"name":"example"}',
      'src/routes/users.route.ts': 'export const route = true;',
      'prisma/schema.prisma': 'model User { id String @id }',
      'src/app.test.ts': 'test("x", () => {})',
      'vite.config.ts': 'export default {}',
    });
    const repository = new MemoryProjects();
    const service = new ProjectIngestionService(repository, path.join(temporaryDirectory, 'extracted'));
    const project = await service.ingest(archive, 'example.zip');

    expect(project.fileCount).toBe(5);
    expect(project.languages).toEqual(['Prisma', 'TypeScript']);
    expect(project.frameworks).toContain('Vite');
    expect(project.manifests).toEqual(['package.json']);
    expect(project.routes).toEqual(['src/routes/users.route.ts']);
    expect(project.schemas).toEqual(['prisma/schema.prisma']);
    expect(project.tests).toEqual(['src/app.test.ts']);
    expect(project.files.map((file) => file.path)).toEqual([...project.files.map((file) => file.path)].sort());
  });
});
