import { createAIProvider } from '../src/providers/ai-provider.factory';
import { OpenAIProvider } from '../src/providers/openai.provider';
import { GeminiProvider } from '../src/providers/gemini.provider';
import { GroqProvider } from '../src/providers/groq.provider';
import { AIProviderConfigError } from '../src/contracts/ai-provider.contract';

describe('AI provider factory', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => { process.env = originalEnv; });

  it('defaults to OpenAI and explicitly selects OpenAI', () => {
    expect(createAIProvider()).toBeInstanceOf(OpenAIProvider);
    expect(createAIProvider('openai')).toBeInstanceOf(OpenAIProvider);
  });
  it('selects Gemini from configuration without requiring credentials at construction', () => {
    process.env.AI_PROVIDER = 'gemini';
    expect(createAIProvider()).toBeInstanceOf(GeminiProvider);
  });
  it('selects Groq from configuration without requiring credentials at construction', () => {
    process.env.AI_PROVIDER = 'groq';
    expect(createAIProvider()).toBeInstanceOf(GroqProvider);
  });
  it.each(['', 'unknown', 'GEMINI', 'secret-config-value'])('rejects unsupported names without echoing them: %j', (name) => {
    expect(() => createAIProvider(name)).toThrow(AIProviderConfigError);
    expect(() => createAIProvider(name)).toThrow('Unsupported AI_PROVIDER. Use openai, gemini, or groq.');
  });
  it('constructs only the selected adapter and does not fall back', () => {
    const openai = jest.fn();
    const gemini = jest.fn(() => { throw new AIProviderConfigError('Gemini config failure'); });
    const groq = jest.fn();
    expect(() => createAIProvider('gemini', { openai, gemini, groq })).toThrow('Gemini config failure');
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openai).not.toHaveBeenCalled();
    expect(groq).not.toHaveBeenCalled();
  });
});
