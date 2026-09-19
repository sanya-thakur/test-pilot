import type { AIProvider, AIRequest, AIResponse } from '../contracts/ai-provider.contract';
import { OpenAIProvider } from '../providers/openai.provider';
import { aiReportContextService, AIReportContextService } from './ai-report-context.service';
import { buildAIAssistantSystemPrompt } from '../prompts/ai-assistant.prompt';
import type { AIAssistantResponse } from '../contracts/ai-assistant.contract';

export class AIAssistantService {
  private provider: AIProvider;
  private reportContextService: AIReportContextService;

  constructor(provider?: AIProvider, reportContextService?: AIReportContextService) {
    this.provider = provider || new OpenAIProvider();
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
    const reportContext = await this.reportContextService.getAIReportContext(datasetId);
    if (!reportContext) {
      return null;
    }

    const systemPrompt = buildAIAssistantSystemPrompt();
    const response = await this.generateResponse({
      prompt: message,
      systemPrompt,
      reportContext,
    });

    return {
      datasetId,
      message,
      answer: response.text,
    };
  }
}

export const aiAssistantService = new AIAssistantService();

