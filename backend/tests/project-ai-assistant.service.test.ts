import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AIProvider, AIRequest, AIResponse } from '../src/contracts/ai-provider.contract';
import type { ProjectRecord, ProjectRepository } from '../src/repositories/project.repository';
import { ProjectAIAssistantService } from '../src/services/project-ai-assistant.service';

describe('ProjectAIAssistantService', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-ai-')); await fs.writeFile(path.join(root, 'users.route.ts'), 'export const users = true;'); await fs.writeFile(path.join(root, 'schema.prisma'), 'model User { id String @id }'); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('sends only bounded, selected source evidence and history to the configured provider', async () => {
    const project: ProjectRecord = { id: 'project-1', originalFilename: 'demo.zip', createdAt: '', sourceRoot: root, fileCount: 2, totalUncompressedBytes: 1, languages: ['TypeScript'], frameworks: ['Express'], manifests: [], routes: ['users.route.ts'], schemas: ['schema.prisma'], tests: [], files: [{ path: 'users.route.ts', sizeBytes: 1, extension: '.ts' }, { path: 'schema.prisma', sizeBytes: 1, extension: '.prisma' }] };
    const repository: ProjectRepository = { create: jest.fn(), list: jest.fn(), findById: jest.fn().mockResolvedValue(project), delete: jest.fn() };
    const provider: AIProvider = { providerName: 'test', modelName: 'test', generateResponse: jest.fn<Promise<AIResponse>, [AIRequest]>().mockResolvedValue({ text: 'Answer with `users.route.ts`.', model: 'test', provider: 'test' }) };
    const service = new ProjectAIAssistantService(provider, repository);
    const result = await service.ask('project-1', { message: 'How is the users API routed?', history: [{ role: 'user', content: 'Focus on API design' }] });
    const request = (provider.generateResponse as jest.Mock).mock.calls[0][0] as AIRequest;
    expect(request.reportContext).toMatchObject({ conversationHistory: [{ role: 'user', content: 'Focus on API design' }] });
    expect(JSON.stringify(request.reportContext)).toContain('users.route.ts');
    expect(result?.evidence).toEqual(expect.arrayContaining([{ path: 'users.route.ts', reason: 'Retrieved bounded source excerpt' }]));
  });
});
