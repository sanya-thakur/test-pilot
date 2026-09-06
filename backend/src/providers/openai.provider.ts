import OpenAI from 'openai';
import {
  AIProvider,
  AIRequest,
  AIResponse,
  AIProviderConfig,
  AIProviderConfigError,
  AIProviderTimeoutError,
  AIProviderAPIError,
  AIProviderError,
} from '../contracts/ai-provider.contract';

export class OpenAIProvider implements AIProvider {
  public readonly providerName = 'openai';
  public readonly modelName: string;
  private client: OpenAI;
  private timeoutMs: number;
  private explicitApiKeyProvided: boolean;

  constructor(config?: AIProviderConfig, customClient?: OpenAI) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    this.explicitApiKeyProvided = Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'dummy-key-for-init');
    this.modelName = config?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.timeoutMs = config?.timeoutMs ?? (process.env.OPENAI_TIMEOUT_MS ? parseInt(process.env.OPENAI_TIMEOUT_MS, 10) : 30000);

    if (customClient) {
      this.client = customClient;
      this.explicitApiKeyProvided = true;
    } else {
      this.client = new OpenAI({
        apiKey: apiKey || 'dummy-key-for-init',
        baseURL: config?.baseUrl || process.env.OPENAI_BASE_URL || undefined,
        timeout: this.timeoutMs,
      });
    }
  }

  async generateResponse(input: AIRequest): Promise<AIResponse> {
    const apiKey = process.env.OPENAI_API_KEY || this.client.apiKey;
    const hasValidKey = this.explicitApiKeyProvided || (apiKey && apiKey !== 'dummy-key-for-init' && apiKey.trim() !== '');

    if (!hasValidKey) {
      throw new AIProviderConfigError('Missing OpenAI API key. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

      if (input.systemPrompt) {
        messages.push({ role: 'system', content: input.systemPrompt });
      }

      let userContent = input.prompt;
      if (input.reportContext) {
        userContent = `Report Context:\n${JSON.stringify(input.reportContext, null, 2)}\n\nUser Question:\n${input.prompt}`;
      }

      messages.push({ role: 'user', content: userContent });

      const completion = await this.client.chat.completions.create(
        {
          model: this.modelName,
          messages,
          temperature: input.temperature ?? 0.7,
          max_tokens: input.maxTokens,
        },
        {
          timeout: this.timeoutMs,
        }
      );

      const choice = completion.choices[0];
      const text = choice?.message?.content || '';

      return {
        text,
        model: completion.model || this.modelName,
        provider: this.providerName,
        usage: {
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        },
        finishReason: choice?.finish_reason,
      };
    } catch (err: any) {
      if (err instanceof AIProviderError) {
        throw err;
      }
      if (err?.name === 'APIConnectionTimeoutError' || err?.name === 'TimeoutError' || err?.code === 'ETIMEDOUT') {
        throw new AIProviderTimeoutError(`OpenAI request timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof OpenAI.APIError) {
        const safeMessage = err.message ? err.message.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]') : 'OpenAI API Error';
        throw new AIProviderAPIError(`OpenAI API error: ${safeMessage}`, err.status);
      }
      const rawMsg = err?.message ? String(err.message).replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]') : 'Unknown error';
      throw new AIProviderError(`Failed to generate AI response: ${rawMsg}`);
    }
  }
}
