import { ApiError, BlockedReason, FinishReason, GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { GeminiProvider } from '../src/providers/gemini.provider';
import { AIProviderAPIError, AIProviderConfigError, AIProviderError, AIProviderTimeoutError } from '../src/contracts/ai-provider.contract';
import type { AIReportContext } from '../src/contracts/ai-report-context';

jest.mock('@google/genai', () => {
  const actual = jest.requireActual('@google/genai');
  return { ...actual, GoogleGenAI: jest.fn() };
});

describe('GeminiProvider (no network)', () => {
  const originalEnv = process.env;
  const generateContent = jest.fn();
  const client = { models: { generateContent } };
  const success = () => ({
    candidates: [{ content: { parts: [{ text: 'Grounded answer' }] }, finishReason: FinishReason.STOP }],
    modelVersion: 'returned-model',
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
  });
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_TIMEOUT_MS;
    jest.clearAllMocks();
    generateContent.mockResolvedValue(success());
    (GoogleGenAI as unknown as jest.Mock).mockImplementation(() => client);
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('constructs without credentials but rejects a request without creating a client', async () => {
    const provider = new GeminiProvider();
    expect(provider.modelName).toBe('gemini-3.8-flash');
    await expect(provider.generateResponse({ prompt: 'Question' })).rejects.toBeInstanceOf(AIProviderConfigError);
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects blank credentials %j', async (apiKey) => {
    await expect(new GeminiProvider({ apiKey }).generateResponse({ prompt: 'Q' })).rejects.toBeInstanceOf(AIProviderConfigError);
  });

  it('reads environment configuration only for Gemini and uses the SDK lazily', async () => {
    process.env.GEMINI_API_KEY = 'fake-gemini-key';
    process.env.GEMINI_MODEL = 'configured-model';
    process.env.GEMINI_TIMEOUT_MS = '1500';
    const provider = new GeminiProvider();
    expect(GoogleGenAI).not.toHaveBeenCalled();
    await provider.generateResponse({ prompt: 'Question' });
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'fake-gemini-key', vertexai: false });
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'configured-model',
      config: expect.objectContaining({ httpOptions: { timeout: 1500, retryOptions: { attempts: 1 } } }),
    }));
  });

  it('maps system prompt, report context, generation settings and response metadata', async () => {
    process.env.GEMINI_MODEL = 'env-model';
    const provider = new GeminiProvider({ model: 'explicit-model', timeoutMs: 1234 }, client);
    const reportContext = { datasetId: 'ds-1', healthScore: 90 } as AIReportContext;
    const response = await provider.generateResponse({
      prompt: 'Explain score', systemPrompt: 'Use report evidence', reportContext, temperature: 0, maxTokens: 120,
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'explicit-model',
      contents: `Report Context:\n${JSON.stringify(reportContext, null, 2)}\n\nUser Question:\nExplain score`,
      config: {
        systemInstruction: 'Use report evidence', temperature: 0, maxOutputTokens: 120,
        abortSignal: expect.any(AbortSignal), httpOptions: { timeout: 1234, retryOptions: { attempts: 1 } },
      },
    });
    expect(response).toEqual({
      text: 'Grounded answer', model: 'returned-model', provider: 'gemini', finishReason: FinishReason.STOP,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  });

  it('logs safe request-size metrics without logging request content', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const prompt = 'Explain score';
    const systemPrompt = 'Use the report only.';
    const reportContext = { datasetId: 'sensitive-dataset-id', healthScore: 90 } as AIReportContext;
    const serializedReportContext = JSON.stringify(reportContext, null, 2);
    const contents = `Report Context:\n${serializedReportContext}\n\nUser Question:\n${prompt}`;

    await new GeminiProvider({ model: 'metrics-model' }, client).generateResponse({
      prompt,
      systemPrompt,
      reportContext,
      requestId: 'request-metrics',
    });

    expect(info).toHaveBeenCalledWith('[GeminiProvider] Request payload metrics', {
      requestId: 'request-metrics',
      provider: 'gemini',
      elapsedMs: expect.any(Number),
      model: 'metrics-model',
      systemPromptCharacterCount: systemPrompt.length,
      userQuestionCharacterCount: prompt.length,
      serializedReportContextCharacterCount: serializedReportContext.length,
      totalConstructedRequestCharacterCount: systemPrompt.length + contents.length,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(prompt);
    expect(JSON.stringify(info.mock.calls)).not.toContain('sensitive-dataset-id');
  });

  it('maps a plain prompt, excludes thought text and supports missing optional metadata', async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [
      { text: 'private reasoning', thought: true }, { text: 'Public ' }, { text: 'answer' },
    ] } }] });
    const response = await new GeminiProvider({}, client).generateResponse({ prompt: 'Plain question' });
    expect(generateContent.mock.calls[0][0].contents).toBe('Plain question');
    expect(response.text).toBe('Public answer');
    expect(response.model).toBe('gemini-3.8-flash');
    expect(response.usage).toBeUndefined();
  });

  it.each([undefined, {}, { candidates: [] }, { candidates: [{ content: { parts: [{ text: '  ' }] } }] },
    { candidates: [{ content: { parts: [{ functionCall: { name: 'tool' } }] } }] },
  ])('rejects empty or unusable output %#', async (response) => {
    generateContent.mockResolvedValue(response);
    await expect(new GeminiProvider({}, client).generateResponse({ prompt: 'Q' })).rejects.toBeInstanceOf(AIProviderAPIError);
  });

  it.each([
    { ...success(), promptFeedback: { blockReason: BlockedReason.SAFETY } },
    { candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: FinishReason.SAFETY }] },
    { candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: FinishReason.RECITATION }] },
  ])('rejects blocked output even with partial text %#', async (response) => {
    generateContent.mockResolvedValue(response);
    await expect(new GeminiProvider({}, client).generateResponse({ prompt: 'Q' })).rejects.toThrow('blocked or unusable');
  });

  it('accepts nonempty output stopped at the token limit', async () => {
    const response = success();
    response.candidates[0].finishReason = FinishReason.MAX_TOKENS;
    generateContent.mockResolvedValue(response);
    await expect(new GeminiProvider({}, client).generateResponse({ prompt: 'Q' })).resolves.toMatchObject({ text: 'Grounded answer' });
  });

  it('enforces a deadline even if the client ignores abort, and aborts the request', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockReturnValue(new Promise(() => {}));
    const pending = new GeminiProvider({ timeoutMs: 50 }, client).generateResponse({ prompt: 'Q', requestId: 'request-deadline' });
    const assertion = expect(pending).rejects.toBeInstanceOf(AIProviderTimeoutError);
    await jest.advanceTimersByTimeAsync(50);
    await assertion;
    expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({
      requestId: 'request-deadline', provider: 'gemini', category: 'adapter_deadline', timeoutMs: 50,
    }));
  });

  it('clears the deadline after success', async () => {
    jest.useFakeTimers();
    await new GeminiProvider({}, client).generateResponse({ prompt: 'Q' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity, 1.5, 2147483648])('rejects invalid timeout %s before invoking the SDK', async (timeoutMs) => {
    await expect(new GeminiProvider({ timeoutMs }, client).generateResponse({ prompt: 'Q' })).rejects.toBeInstanceOf(AIProviderConfigError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects a blank model without echoing configuration', async () => {
    await expect(new GeminiProvider({ model: ' ' }, client).generateResponse({ prompt: 'Q' })).rejects.toBeInstanceOf(AIProviderConfigError);
  });

  it.each([408, 504])('maps API status %s to timeout', async (status) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValue(new ApiError({ status, message: 'sensitive vendor details' }));
    await expect(new GeminiProvider({}, client).generateResponse({ prompt: 'Q', requestId: 'request-http-timeout' })).rejects.toBeInstanceOf(AIProviderTimeoutError);
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({
      requestId: 'request-http-timeout', category: 'gemini_http_timeout', httpStatus: status,
    }));
  });

  it.each(['TimeoutError'])('maps SDK %s safely', async (name) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValue(Object.assign(new Error('sensitive details'), { name }));
    await expect(new GeminiProvider({}, client).generateResponse({ prompt: 'Q', requestId: 'request-sdk-timeout' })).rejects.toThrow('Gemini request timed out');
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({
      requestId: 'request-sdk-timeout', category: 'sdk_or_transport_timeout',
    }));
  });

  it('does not misreport an immediate SDK abort as an elapsed provider timeout', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValueOnce(Object.assign(new Error('private transport details'), { name: 'AbortError' }));
    const provider = new GeminiProvider({ timeoutMs: 30000 }, client);
    const pending = provider.generateResponse({ prompt: 'Synthetic question', requestId: 'request-early-abort' });
    await expect(pending).rejects.toBeInstanceOf(AIProviderError);
    await expect(pending).rejects.not.toBeInstanceOf(AIProviderTimeoutError);
    await expect(pending).rejects.toMatchObject({ message: 'Gemini request was aborted before its timeout' });
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({
      requestId: 'request-early-abort', provider: 'gemini', category: 'early_abort', timeoutMs: 30000,
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private transport details');
  });

  it('uses a fresh cancellation signal on the next explicit request after a deadline', async () => {
    jest.useFakeTimers();
    generateContent.mockImplementationOnce(() => new Promise(() => {}));
    const provider = new GeminiProvider({ timeoutMs: 50 }, client);
    const first = provider.generateResponse({ prompt: 'Synthetic question' });
    const timeout = expect(first).rejects.toBeInstanceOf(AIProviderTimeoutError);
    await jest.advanceTimersByTimeAsync(50);
    await timeout;
    await expect(provider.generateResponse({ prompt: 'Synthetic question' })).resolves.toMatchObject({ text: 'Grounded answer' });
    const firstSignal = generateContent.mock.calls[0][0].config.abortSignal;
    const secondSignal = generateContent.mock.calls[1][0].config.abortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(firstSignal).not.toBe(secondSignal);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('exercises the real SDK with a fake transport: early abort then explicit success, without automatic retries', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ActualGoogleGenAI = jest.requireActual<typeof import('@google/genai')>('@google/genai').GoogleGenAI;
    const fetch = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('private transport details'), { name: 'AbortError' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success()), { headers: { 'Content-Type': 'application/json' } }));
    const realClient = new ActualGoogleGenAI({ apiKey: 'fake-test-key', vertexai: false, httpOptions: { fetch } });
    const provider = new GeminiProvider({ timeoutMs: 30000 }, realClient);
    const first = provider.generateResponse({ prompt: 'Synthetic question' });
    await expect(first).rejects.not.toBeInstanceOf(AIProviderTimeoutError);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(provider.generateResponse({ prompt: 'Synthetic question' })).resolves.toMatchObject({ text: 'Grounded answer' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 429, 500])('maps API status %s without exposing provider details', async (status) => {
    const sensitive = 'fake-key Authorization: Bearer fake-token sample-cell';
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValue(new ApiError({ status, message: sensitive }));
    const pending = new GeminiProvider({}, client).generateResponse({ prompt: sensitive });
    await expect(pending).rejects.toMatchObject({ name: 'AIProviderAPIError', statusCode: status, message: 'Gemini API request failed' });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({
      category: 'gemini_http_failure', httpStatus: status,
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sensitive);
  });

  it('maps network failures to a generic safe error without preserving the cause', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValue(new Error('Authorization: secret; payload: sample-cell'));
    const pending = new GeminiProvider({}, client).generateResponse({ prompt: 'Q' });
    await expect(pending).rejects.toBeInstanceOf(AIProviderError);
    await expect(pending).rejects.toMatchObject({ message: 'Gemini request failed' });
    await expect(pending).rejects.not.toHaveProperty('cause');
    expect(warn).toHaveBeenCalledWith('[GeminiProvider] Request failed', expect.objectContaining({ category: 'other_provider_failure' }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Authorization: secret');
  });
});
