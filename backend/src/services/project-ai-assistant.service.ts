import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { AIProvider } from '../contracts/ai-provider.contract';
import { createAIProvider } from '../providers/ai-provider.factory';
import type { ProjectRepository } from '../repositories/project.repository';
import { LocalProjectRepository } from '../repositories/local-project.repository';
import type { ProjectAIAssistantRequest, ProjectAIAssistantResponse } from '../contracts/project-ai-assistant.contract';
import { buildProjectAssistantSystemPrompt } from '../prompts/project-ai-assistant.prompt';
import type { AIReportContext } from '../contracts/ai-report-context';

const MAX_FILES = 6; const MAX_CHARS = 18_000;
const words = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []);

export class ProjectAIAssistantService {
  constructor(private readonly provider: AIProvider = createAIProvider(), private readonly projects: ProjectRepository = new LocalProjectRepository()) {}
  async ask(projectId: string, input: ProjectAIAssistantRequest): Promise<ProjectAIAssistantResponse | null> {
    const project = await this.projects.findById(projectId); if (!project) return null;
    if (!project.sourceRoot) throw new Error('Project source is unavailable');
    const terms = words(`${input.message} ${input.history.map((item) => item.content).join(' ')}`);
    const candidates = project.files.map((file) => ({ file, score: [...terms].reduce((score, term) => score + (file.path.toLowerCase().includes(term) ? 3 : 0), 0) + (project.routes.includes(file.path) ? 1 : 0) }));
    const selected = candidates.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path)).slice(0, MAX_FILES).map((item) => item.file);
    let used = 0; const excerpts: Array<{ path: string; content: string }> = [];
    for (const file of selected) {
      const fullPath = path.resolve(project.sourceRoot, file.path);
      if (!fullPath.startsWith(`${path.resolve(project.sourceRoot)}${path.sep}`)) continue;
      const content = await fs.readFile(fullPath, 'utf8').catch(() => '');
      const remaining = MAX_CHARS - used; if (!content || remaining <= 0) break;
      const clipped = content.slice(0, remaining); used += clipped.length; excerpts.push({ path: file.path, content: clipped });
    }
    const context = { inventory: { languages: project.languages, frameworks: project.frameworks, manifests: project.manifests, routes: project.routes, schemas: project.schemas, tests: project.tests }, sourceExcerpts: excerpts, conversationHistory: input.history };
    // Providers serialize this opaque, server-built object; it is structurally
    // distinct from a dataset report but retains the established provider API.
    const response = await this.provider.generateResponse({ prompt: input.message, systemPrompt: buildProjectAssistantSystemPrompt(), reportContext: context as unknown as AIReportContext, requestId: randomUUID(), maxTokens: 900 });
    return { projectId, message: input.message, answer: response.text, evidence: excerpts.map((excerpt) => ({ path: excerpt.path, reason: 'Retrieved bounded source excerpt' })) };
  }
}
export const projectAIAssistantService = new ProjectAIAssistantService();
