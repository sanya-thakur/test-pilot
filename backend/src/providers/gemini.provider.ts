import { GoogleGenAI, ApiError, FinishReason, BlockedReason } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import {
  AIProvider, AIProviderConfig, AIRequest, AIResponse,
  AIProviderConfigError, AIProviderTimeoutError, AIProviderAPIError, AIProviderError,
} from '../contracts/ai-provider.contract';

export type GeminiClient = { models: Pick<GoogleGenAI['models'], 'generateContent'> };
type GeminiFailureCategory =
  | 'adapter_deadline'
  | 'sdk_or_transport_timeout'
  | 'gemini_http_timeout'
  | 'early_abort'
  | 'gemini_http_failure'
  | 'other_provider_failure';

type GeminiRequestMetrics = {
  model: string;
  systemPromptCharacterCount: number;
  userQuestionCharacterCount: number;
  serializedReportContextCharacterCount: number;
  totalConstructedRequestCharacterCount: number;
};

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini';
  readonly modelName: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: AIProviderConfig = {},
    private readonly customClient?: GeminiClient,
  ) {
    this.modelName = config.model ?? process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    this.timeoutMs = config.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS ?? 30000);
  }

  private logFailure(
    input: AIRequest,
    startedAt: number,
    category: GeminiFailureCategory,
    httpStatus?: number,
    requestMetrics?: GeminiRequestMetrics,
  ): void {
    // Deliberately omit exception messages, prompts, report context, headers and credentials.
    console.warn('[GeminiProvider] Request failed', {
      requestId: input.requestId ?? 'untracked',
      provider: this.providerName,
      category,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      timeoutMs: this.timeoutMs,
      ...(requestMetrics ?? {}),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    });
  }

  private logRequestMetrics(input: AIRequest, startedAt: number, requestMetrics: GeminiRequestMetrics): void {
    // Deliberately log counts only, never prompt or report-context content.
    console.info('[GeminiProvider] Request payload metrics', {
      requestId: input.requestId ?? 'untracked',
      provider: this.providerName,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...requestMetrics,
    });
  }

  async generateResponse(input: AIRequest): Promise<AIResponse> {
    const apiKey = (this.config.apiKey ?? process.env.GEMINI_API_KEY)?.trim();
    if (!this.customClient && !apiKey) {
      throw new AIProviderConfigError('Missing Gemini API key. Set GEMINI_API_KEY.');
    }
    if (!this.modelName.trim() || !Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2147483647) {
      throw new AIProviderConfigError('Gemini requires a non-empty model and a positive timeout in milliseconds (maximum 2147483647).');
    }

    const controller = new AbortController();
    const startedAt = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let adapterDeadlineReached = false;
    let response: GenerateContentResponse;
    let requestMetrics: GeminiRequestMetrics | undefined;
    try {
      // Explicit Developer API credentials prevent ambient Vertex configuration
      // from changing the selected backend. No SDK client is created at startup.
      const client = this.customClient ?? new GoogleGenAI({ apiKey, vertexai: false });
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          adapterDeadlineReached = true;
          reject(new AIProviderTimeoutError('Gemini request timed out'));
          controller.abort();
        }, this.timeoutMs);
      });
      const serializedReportContext = input.reportContext ? JSON.stringify(input.reportContext, null, 2) : '';
      const contents = input.reportContext
        ? `Report Context:\n${serializedReportContext}\n\nUser Question:\n${input.prompt}`
        : input.prompt;
      requestMetrics = {
        model: this.modelName,
        systemPromptCharacterCount: input.systemPrompt?.length ?? 0,
        userQuestionCharacterCount: input.prompt.length,
        serializedReportContextCharacterCount: serializedReportContext.length,
        // Includes the system instruction and the constructed contents (including fixed labels).
        totalConstructedRequestCharacterCount: (input.systemPrompt?.length ?? 0) + contents.length,
      };
      this.logRequestMetrics(input, startedAt, requestMetrics);
      response = await Promise.race([
        client.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            systemInstruction: input.systemPrompt,
            temperature: input.temperature ?? 0.7,
            maxOutputTokens: input.maxTokens,
            abortSignal: controller.signal,
            httpOptions: { timeout: this.timeoutMs, retryOptions: { attempts: 1 } },
          },
        }),
        deadline,
      ]);
    } catch (error: unknown) {
      const failure = error as { name?: string; code?: string } | null;
      const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (adapterDeadlineReached) {
        this.logFailure(input, startedAt, 'adapter_deadline', undefined, requestMetrics);
        throw new AIProviderTimeoutError('Gemini request timed out');
      }
      if (failure?.name === 'TimeoutError' || failure?.name === 'RequestTimeoutError' || failure?.code === 'ETIMEDOUT'
        || (failure?.name === 'AbortError' && elapsedMs >= this.timeoutMs)) {
        this.logFailure(input, startedAt, 'sdk_or_transport_timeout', undefined, requestMetrics);
        throw new AIProviderTimeoutError('Gemini request timed out');
      }
      if (failure?.name === 'AbortError') {
        this.logFailure(input, startedAt, 'early_abort', undefined, requestMetrics);
        throw new AIProviderError('Gemini request was aborted before its timeout');
      }
      if (error instanceof ApiError) {
        if (error.status === 408 || error.status === 504) {
          this.logFailure(input, startedAt, 'gemini_http_timeout', error.status, requestMetrics);
          throw new AIProviderTimeoutError('Gemini request timed out');
        }
        this.logFailure(input, startedAt, 'gemini_http_failure', error.status, requestMetrics);
        throw new AIProviderAPIError('Gemini API request failed', error.status);
      }
      // Never include SDK messages, causes, payloads or headers in public errors.
      this.logFailure(input, startedAt, 'other_provider_failure', undefined, requestMetrics);
      throw new AIProviderError('Gemini request failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    const candidate = response?.candidates?.[0];
    const blockReason = response?.promptFeedback?.blockReason;
    if ((blockReason && blockReason !== BlockedReason.BLOCKED_REASON_UNSPECIFIED)
      || (candidate?.finishReason && candidate.finishReason !== FinishReason.STOP && candidate.finishReason !== FinishReason.MAX_TOKENS)) {
      throw new AIProviderAPIError('Gemini returned a blocked or unusable response');
    }
    // Read text parts directly: ignore thought/tool parts and avoid SDK getter
    // warnings that can include details of unexpected response parts.
    const text = candidate?.content?.parts
      ?.filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text).join('') ?? '';
    if (!text.trim()) {
      throw new AIProviderAPIError('Gemini returned an empty or unusable response');
    }
    return {
      text,
      model: response.modelVersion || this.modelName,
      provider: this.providerName,
      finishReason: candidate?.finishReason,
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }
}
