import { OpenAIProvider } from '../src/providers/openai.provider';
import {
  AIProviderConfigError,
  AIProviderTimeoutError,
  AIProviderAPIError,
} from '../src/contracts/ai-provider.contract';
import OpenAI from 'openai';

describe('OpenAIProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws AIProviderConfigError when API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProvider({ apiKey: '' });

    await expect(provider.generateResponse({ prompt: 'Hello' })).rejects.toThrow(AIProviderConfigError);
    await expect(provider.generateResponse({ prompt: 'Hello' })).rejects.toThrow(
      'Missing OpenAI API key'
    );
  });

  it('generates successful response using a mocked OpenAI client', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: { content: 'Mocked AI answer' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
      },
    });

    const mockOpenAIClient: any = {
      apiKey: 'sk-mock-key-12345',
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const provider = new OpenAIProvider({ apiKey: 'sk-test-key' }, mockOpenAIClient);
    expect(provider.providerName).toBe('openai');
    expect(provider.modelName).toBe('gpt-4o-mini');

    const response = await provider.generateResponse({
      prompt: 'Explain null values in column X',
      systemPrompt: 'You are a data assistant.',
      reportContext: {
        datasetId: 'd-1',
        id: 'd-1',
        originalFilename: 'test.csv',
        rowCount: 100,
        columnCount: 2,
        duplicateRowCount: 0,
        healthScore: 100,
        healthScoreDeductions: {},
        scoringVersion: 'v1',
        severityTotals: { info: 0, warning: 0, error: 0 },
        findings: [],
        columnProfiles: [],
        profilerVersion: 'v1',
        createdAt: '2026-09-06T12:00:00.000Z',
      },
    });

    expect(response.text).toBe('Mocked AI answer');
    expect(response.provider).toBe('openai');
    expect(response.model).toBe('gpt-4o-mini');
    expect(response.usage).toEqual({ promptTokens: 15, completionTokens: 25, totalTokens: 40 });
    expect(response.finishReason).toBe('stop');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a data assistant.' });
    expect(callArgs.messages[1].content).toContain('Report Context:');
    expect(callArgs.messages[1].content).toContain('User Question:\nExplain null values in column X');
  });

  it('respects custom model and timeout configuration', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      model: 'gpt-4o-custom',
      choices: [{ message: { content: 'Custom model answer' }, finish_reason: 'stop' }],
    });

    const mockOpenAIClient: any = {
      apiKey: 'sk-mock-key',
      chat: { completions: { create: mockCreate } },
    };

    const provider = new OpenAIProvider(
      { apiKey: 'sk-mock-key', model: 'gpt-4o-custom', timeoutMs: 5000 },
      mockOpenAIClient
    );

    expect(provider.modelName).toBe('gpt-4o-custom');

    const res = await provider.generateResponse({ prompt: 'Test model' });
    expect(res.text).toBe('Custom model answer');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-custom' }),
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it('handles timeout errors cleanly without exposing secrets', async () => {
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'APIConnectionTimeoutError';

    const mockOpenAIClient: any = {
      apiKey: 'sk-secret-key-999',
      chat: { completions: { create: jest.fn().mockRejectedValue(timeoutError) } },
    };

    const provider = new OpenAIProvider({ apiKey: 'sk-secret-key-999', timeoutMs: 2000 }, mockOpenAIClient);

    await expect(provider.generateResponse({ prompt: 'Timeout test' })).rejects.toThrow(AIProviderTimeoutError);
  });

  it('handles OpenAI API errors cleanly without secret leakage', async () => {
    const apiError = OpenAI.APIError.generate(
      401,
      { error: { message: 'Invalid authorization header sk-secret-key-123456789' } },
      'Invalid authorization header sk-secret-key-123456789',
      new Headers()
    );

    const mockOpenAIClient: any = {
      apiKey: 'sk-secret-key-123456789',
      chat: { completions: { create: jest.fn().mockRejectedValue(apiError) } },
    };

    const provider = new OpenAIProvider({ apiKey: 'sk-secret-key-123456789' }, mockOpenAIClient);

    try {
      await provider.generateResponse({ prompt: 'Error test' });
      fail('Expected provider.generateResponse to throw');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AIProviderAPIError);
      expect(err.statusCode).toBe(401);
      expect(err.message).not.toContain('sk-secret-key-123456789');
      expect(err.message).toContain('[REDACTED_API_KEY]');
    }
  });
});
