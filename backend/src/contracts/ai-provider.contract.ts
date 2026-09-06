import type { AIReportContext } from './ai-report-context';

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  reportContext?: AIReportContext;
}

export interface AIUsageStats {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  text: string;
  model: string;
  provider: string;
  usage?: AIUsageStats;
  finishReason?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIProviderConfigError extends AIProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderConfigError';
  }
}

export class AIProviderTimeoutError extends AIProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderTimeoutError';
  }
}

export class AIProviderAPIError extends AIProviderError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'AIProviderAPIError';
    this.statusCode = statusCode;
  }
}

export interface AIProvider {
  readonly providerName: string;
  readonly modelName: string;
  generateResponse(input: AIRequest): Promise<AIResponse>;
}
