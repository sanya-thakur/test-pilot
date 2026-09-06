import type { AIProvider, AIRequest, AIResponse } from '../contracts/ai-provider.contract';
import { OpenAIProvider } from '../providers/openai.provider';

export class AIAssistantService {
  private provider: AIProvider;

  constructor(provider?: AIProvider) {
    this.provider = provider || new OpenAIProvider();
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
}

export const aiAssistantService = new AIAssistantService();
