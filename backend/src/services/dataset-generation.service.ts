import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { ProjectRepository } from '../repositories/project.repository';
import { LocalProjectRepository } from '../repositories/local-project.repository';
import type { DatasetGenerationRequest } from '../contracts/dataset-generation.contract';

type Field = { name: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'email'; required: boolean };
type GeneratedArtifact = { id: string; projectId: string; filename: string; format: 'csv' | 'json'; createdAt: string; recordCount: number; seed: number; scenarios: string[]; model: { name: string; fields: Field[] }; validation: Record<string, { generated: number; valid: number; invalid: number; intent: string }>; path: string };
const outputRoot = path.resolve(__dirname, '../../..', 'data/generated-datasets');
const lcg = (seed: number) => () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export class DatasetGenerationService {
  constructor(private readonly projects: ProjectRepository = new LocalProjectRepository()) {}
  async generate(projectId: string, request: DatasetGenerationRequest): Promise<Omit<GeneratedArtifact, 'path'> | null> {
    const project = await this.projects.findById(projectId); if (!project) return null;
    if (!project.sourceRoot) throw new Error('Project source unavailable');
    const model = await this.infer(project.sourceRoot, project.schemas, project.files.map((file) => file.path));
    const seed = request.seed ?? parseInt(crypto.createHash('sha256').update(`${projectId}:${request.recordCount}:${request.format}:${request.scenarios.join(',')}`).digest('hex').slice(0, 8), 16);
    const random = lcg(seed); const rows: Record<string, unknown>[] = []; const validation: GeneratedArtifact['validation'] = {};
    for (const scenario of request.scenarios) validation[scenario] = { generated: 0, valid: scenario === 'valid' || scenario === 'boundary' || scenario === 'duplicate' ? request.recordCount : 0, invalid: scenario === 'invalid' || scenario === 'missing' ? request.recordCount : 0, intent: { valid: 'Nominal values that satisfy inferred field types.', boundary: 'Type-valid values at representative boundaries.', invalid: 'Deliberately type or format-invalid values for negative tests.', missing: 'Required fields omitted for validation tests.', duplicate: 'Repeated records for uniqueness and deduplication tests.' }[scenario] };
    for (const scenario of request.scenarios) for (let index = 0; index < request.recordCount; index += 1) rows.push(this.row(model.fields, index, scenario, random, rows));
    const id = crypto.randomUUID(); const extension = request.format; const filename = `${model.name.toLowerCase()}-${id}.${extension}`; const storedPath = path.resolve(outputRoot, projectId, filename); await fs.mkdir(path.dirname(storedPath), { recursive: true });
    const body = request.format === 'json' ? JSON.stringify(rows, null, 2) : [model.fields.map((field) => csv(field.name)).join(','), ...rows.map((row) => model.fields.map((field) => csv(row[field.name])).join(','))].join('\n'); await fs.writeFile(storedPath, body, 'utf8');
    const artifact: GeneratedArtifact = { id, projectId, filename, format: request.format, createdAt: new Date().toISOString(), recordCount: rows.length, seed, scenarios: request.scenarios, model, validation, path: storedPath };
    await fs.writeFile(`${storedPath}.meta.json`, JSON.stringify(artifact, null, 2), 'utf8'); return this.public(artifact);
  }
  async download(projectId: string, id: string): Promise<{ path: string; filename: string; format: string } | null> { const dir = path.resolve(outputRoot, projectId); const matches = await fs.readdir(dir).catch(() => []); const file = matches.find((name) => name.includes(id) && !name.endsWith('.meta.json')); if (!file) return null; const resolved = path.resolve(dir, file); return resolved.startsWith(`${dir}${path.sep}`) ? { path: resolved, filename: file, format: path.extname(file).slice(1) } : null; }
  private public(artifact: GeneratedArtifact): Omit<GeneratedArtifact, 'path'> { const { path: _path, ...safe } = artifact; return safe; }
  private async infer(root: string, schemas: string[], files: string[]): Promise<{ name: string; fields: Field[] }> { const candidates = [...schemas, ...files.filter((file) => /(model|entity|dto|course|user)/i.test(file))].slice(0, 12); for (const file of candidates) { const full = path.resolve(root, file); if (!full.startsWith(`${path.resolve(root)}${path.sep}`)) continue; const text = await fs.readFile(full, 'utf8').catch(() => ''); const fields = [...text.matchAll(/(?:private\s+)?(String|int|Integer|long|double|float|boolean|Date|LocalDate|email|Email)\s+(\w+)/g)].map((match) => ({ name: match[2], type: this.type(match[1], match[2]), required: !/optional|nullable/i.test(match[0]) })); if (fields.length) return { name: path.basename(file).replace(/\.[^.]+$/, ''), fields: fields.slice(0, 20) }; } return { name: 'GeneratedRecord', fields: [{ name: 'id', type: 'integer', required: true }, { name: 'name', type: 'string', required: true }, { name: 'email', type: 'email', required: true }] }; }
  private type(raw: string, name: string): Field['type'] { if (/email/i.test(raw + name)) return 'email'; if (/date/i.test(raw)) return 'date'; if (/boolean/i.test(raw)) return 'boolean'; if (/int|long/i.test(raw)) return 'integer'; if (/double|float/i.test(raw)) return 'number'; return 'string'; }
  private row(fields: Field[], index: number, scenario: string, random: () => number, prior: Record<string, unknown>[]): Record<string, unknown> { if (scenario === 'duplicate' && prior.length) return { ...prior[prior.length - 1] }; return Object.fromEntries(fields.map((field) => { if (scenario === 'missing' && field.required) return [field.name, '']; if (scenario === 'invalid') return [field.name, field.type === 'email' ? 'not-an-email' : field.type === 'integer' ? 'not-a-number' : 'INVALID']; if (scenario === 'boundary') return [field.name, field.type === 'integer' ? 0 : field.type === 'email' ? 'a@b.co' : field.type === 'boolean' ? false : 'x']; const value = field.type === 'integer' ? index + 1 : field.type === 'number' ? Number((random() * 1000).toFixed(2)) : field.type === 'boolean' ? random() > .5 : field.type === 'date' ? `2025-01-${String((index % 28) + 1).padStart(2, '0')}` : field.type === 'email' ? `user${index + 1}@example.test` : `${field.name}-${index + 1}`; return [field.name, value]; })); }
}
export const datasetGenerationService = new DatasetGenerationService();
