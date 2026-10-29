import OpenAI from 'openai';
import {
  AIProviderAPIError,
  AIProviderConfigError,
  AIProviderTimeoutError,
} from '../src/contracts/ai-provider.contract';
import { GroqProvider } from '../src/providers/groq.provider';

describe('GroqProvider (no network)', () => {
  it('rejects a request when no key or injected client is available', async () => {
    const previous = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(new GroqProvider().generateResponse({ prompt: 'Question' })).rejects.toBeInstanceOf(AIProviderConfigError);
    } finally {
      if (previous === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = previous;
    }
  });

  it('maps report context and returns normalized Groq output', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const create = jest.fn().mockResolvedValue({
      model: 'openai/gpt-oss-20b',
      choices: [{ message: { content: 'Grounded answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    const client = { chat: { completions: { create } } } as any;
    const provider = new GroqProvider({ model: 'configured-model', timeoutMs: 1234 }, client);

    await expect(provider.generateResponse({
      prompt: 'Explain score',
      systemPrompt: 'Use only the report.',
      reportContext: { datasetId: 'dataset-1', healthScore: 90 } as any,
    })).resolves.toEqual({
      text: 'Grounded answer', model: 'openai/gpt-oss-20b', provider: 'groq', finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'configured-model',
      messages: [
        { role: 'system', content: 'Use only the report.' },
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Report Context:') }),
      ],
    }), { timeout: 1234 });
    const reportContext = { datasetId: 'dataset-1', healthScore: 90 };
    const serializedReportContext = JSON.stringify(reportContext, null, 2);
    const userContent = `Report Context:\n${serializedReportContext}\n\nUser Question:\nExplain score`;
    expect(info).toHaveBeenCalledWith('[GroqProvider] Request payload metrics', {
      requestId: 'untracked', provider: 'groq', elapsedMs: expect.any(Number), model: 'configured-model',
      systemPromptCharacterCount: 'Use only the report.'.length,
      userQuestionCharacterCount: 'Explain score'.length,
      serializedReportContextCharacterCount: serializedReportContext.length,
      totalConstructedRequestCharacterCount: 'Use only the report.'.length + userContent.length,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain('dataset-1');
  });

  it.each([408, 504])('maps Groq HTTP %s to the existing timeout error safely', async (status) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { chat: { completions: { create: jest.fn().mockRejectedValue(new OpenAI.APIError(status, {}, 'sensitive provider detail', new Headers())) } } } as any;
    await expect(new GroqProvider({}, client).generateResponse({ prompt: 'Sensitive question', requestId: 'groq-timeout' }))
      .rejects.toBeInstanceOf(AIProviderTimeoutError);
    expect(warn).toHaveBeenCalledWith('[GroqProvider] Request failed', expect.objectContaining({
      requestId: 'groq-timeout', provider: 'groq', category: 'timeout', httpStatus: status,
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive provider detail');
  });

  it('maps non-timeout API failures without exposing provider details', async () => {
    const client = { chat: { completions: { create: jest.fn().mockRejectedValue(new OpenAI.APIError(401, {}, 'sensitive provider detail', new Headers())) } } } as any;
    await expect(new GroqProvider({}, client).generateResponse({ prompt: 'Question' }))
      .rejects.toEqual(expect.objectContaining({ name: 'AIProviderAPIError', statusCode: 401, message: 'Groq API request failed' }));
    await expect(new GroqProvider({}, client).generateResponse({ prompt: 'Question' })).rejects.toBeInstanceOf(AIProviderAPIError);
  });
});
