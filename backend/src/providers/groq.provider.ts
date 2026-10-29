import OpenAI from 'openai';
import {
  AIProvider,
  AIProviderConfig,
  AIRequest,
  AIResponse,
  AIProviderAPIError,
  AIProviderConfigError,
  AIProviderError,
  AIProviderTimeoutError,
} from '../contracts/ai-provider.contract';

export type GroqClient = Pick<OpenAI, 'chat'>;
type GroqRequestMetrics = {
  model: string;
  systemPromptCharacterCount: number;
  userQuestionCharacterCount: number;
  serializedReportContextCharacterCount: number;
  totalConstructedRequestCharacterCount: number;
};

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider implements AIProvider {
  readonly providerName = 'groq';
  readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly client: GroqClient;
  private readonly hasConfiguredKey: boolean;

  constructor(config: AIProviderConfig = {}, customClient?: GroqClient) {
    const apiKey = (config.apiKey ?? process.env.GROQ_API_KEY)?.trim();
    this.modelName = config.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? Number(process.env.GROQ_TIMEOUT_MS ?? 30000);
    this.hasConfiguredKey = Boolean(apiKey) || Boolean(customClient);
    this.client = customClient ?? new OpenAI({
      apiKey: apiKey || 'dummy-key-for-init',
      baseURL: config.baseUrl ?? process.env.GROQ_BASE_URL ?? DEFAULT_BASE_URL,
      timeout: this.timeoutMs,
      maxRetries: 0,
    });
  }

  private logFailure(
    input: AIRequest,
    startedAt: number,
    category: 'timeout' | 'api_failure' | 'other_failure',
    httpStatus?: number,
    requestMetrics?: GroqRequestMetrics,
  ): void {
    // Deliberately omit error messages, prompts, report context, headers and credentials.
    console.warn('[GroqProvider] Request failed', {
      requestId: input.requestId ?? 'untracked',
      provider: this.providerName,
      category,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      timeoutMs: this.timeoutMs,
      ...(requestMetrics ?? {}),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    });
  }

  private logRequestMetrics(input: AIRequest, startedAt: number, requestMetrics: GroqRequestMetrics): void {
    console.info('[GroqProvider] Request payload metrics', {
      requestId: input.requestId ?? 'untracked',
      provider: this.providerName,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...requestMetrics,
    });
  }

  async generateResponse(input: AIRequest): Promise<AIResponse> {
    if (!this.hasConfiguredKey) {
      throw new AIProviderConfigError('Missing Groq API key. Set GROQ_API_KEY.');
    }
    if (!this.modelName.trim() || !Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2147483647) {
      throw new AIProviderConfigError('Groq requires a non-empty model and a positive timeout in milliseconds (maximum 2147483647).');
    }

    const serializedReportContext = input.reportContext ? JSON.stringify(input.reportContext, null, 2) : '';
    const userContent = input.reportContext
      ? `Report Context:\n${serializedReportContext}\n\nUser Question:\n${input.prompt}`
      : input.prompt;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (input.systemPrompt) messages.push({ role: 'system', content: input.systemPrompt });
    messages.push({ role: 'user', content: userContent });

    const startedAt = performance.now();
    const requestMetrics: GroqRequestMetrics = {
      model: this.modelName,
      systemPromptCharacterCount: input.systemPrompt?.length ?? 0,
      userQuestionCharacterCount: input.prompt.length,
      serializedReportContextCharacterCount: serializedReportContext.length,
      totalConstructedRequestCharacterCount: (input.systemPrompt?.length ?? 0) + userContent.length,
    };
    this.logRequestMetrics(input, startedAt, requestMetrics);
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.modelName,
          messages,
          temperature: input.temperature ?? 0.7,
          max_tokens: input.maxTokens,
        },
        { timeout: this.timeoutMs },
      );
      const choice = completion.choices[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      return {
        text,
        model: completion.model || this.modelName,
        provider: this.providerName,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined,
        finishReason: choice?.finish_reason,
      };
    } catch (error: unknown) {
      const failure = error as { name?: string; code?: string; status?: number } | null;
      if (failure?.name === 'APIConnectionTimeoutError' || failure?.name === 'TimeoutError'
        || failure?.code === 'ETIMEDOUT' || failure?.status === 408 || failure?.status === 504) {
        this.logFailure(input, startedAt, 'timeout', failure?.status, requestMetrics);
        throw new AIProviderTimeoutError('Groq request timed out');
      }
      if (error instanceof OpenAI.APIError) {
        this.logFailure(input, startedAt, 'api_failure', error.status, requestMetrics);
        throw new AIProviderAPIError('Groq API request failed', error.status);
      }
      this.logFailure(input, startedAt, 'other_failure', undefined, requestMetrics);
      throw new AIProviderError('Groq request failed');
    }
  }
}
