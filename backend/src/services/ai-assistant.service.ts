import { randomUUID } from 'crypto';
import type { AIProvider, AIRequest, AIResponse } from '../contracts/ai-provider.contract';
import { createAIProvider } from '../providers/ai-provider.factory';
import { aiReportContextService, AIReportContextService, buildAIProviderContext } from './ai-report-context.service';
import { buildAIAssistantSystemPrompt } from '../prompts/ai-assistant.prompt';
import type { AIAssistantResponse } from '../contracts/ai-assistant.contract';

export class AIAssistantService {
  private provider: AIProvider;
  private reportContextService: AIReportContextService;

  constructor(provider?: AIProvider, reportContextService?: AIReportContextService) {
    this.provider = provider || createAIProvider();
    this.reportContextService = reportContextService || aiReportContextService;
  }

  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  getProvider(): AIProvider {
    return this.provider;
  }

  async generateResponse(input: AIRequest): Promise<AIResponse> {
    return this.provider.generateResponse(input);
  }

  async askDatasetQuestion(datasetId: string, message: string): Promise<AIAssistantResponse | null> {
    const requestId = randomUUID();
    const startedAt = performance.now();
    let contextDurationMs: number;
    let reportContext;
    try {
      reportContext = await this.reportContextService.getAIReportContext(datasetId);
      contextDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
    } catch (error) {
      // Do not log dataset IDs, context, or exception messages: they may be sensitive.
      console.warn('[AIAssistantService] Context loading failed', {
        requestId,
        provider: this.provider.providerName,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        stage: 'context',
      });
      throw error;
    }
    if (!reportContext) {
      console.info('[AIAssistantService] Request completed', {
        requestId,
        provider: this.provider.providerName,
        contextDurationMs,
        providerDurationMs: 0,
        totalDurationMs: contextDurationMs,
        outcome: 'dataset_not_found',
      });
      return null;
    }

    const systemPrompt = buildAIAssistantSystemPrompt();
    const providerContext = buildAIProviderContext(reportContext);
    console.info('[AIAssistantService] Provider context prepared', {
      requestId,
      provider: this.provider.providerName,
      ...providerContext.diagnostics,
    });
    const providerStartedAt = performance.now();
    let response: AIResponse;
    try {
      response = await this.generateResponse({
        prompt: message,
        systemPrompt,
        reportContext: providerContext.context,
        requestId,
      });
    } catch (error) {
      console.warn('[AIAssistantService] Provider execution failed', {
        requestId,
        provider: this.provider.providerName,
        contextDurationMs,
        providerDurationMs: Math.max(0, Math.round(performance.now() - providerStartedAt)),
        totalDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        stage: 'provider',
      });
      throw error;
    }

    console.info('[AIAssistantService] Request completed', {
      requestId,
      provider: this.provider.providerName,
      contextDurationMs,
      providerDurationMs: Math.max(0, Math.round(performance.now() - providerStartedAt)),
      totalDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outcome: 'success',
    });

    return {
      datasetId,
      message,
      answer: response.text,
    };
  }
}

export const aiAssistantService = new AIAssistantService();

