import { AIProvider, AIProviderConfigError } from '../contracts/ai-provider.contract';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';

type ProviderConstructors = { openai: () => AIProvider; gemini: () => AIProvider; groq: () => AIProvider };

export function createAIProvider(
  name = process.env.AI_PROVIDER ?? 'openai',
  constructors: ProviderConstructors = {
    openai: () => new OpenAIProvider(),
    gemini: () => new GeminiProvider(),
    groq: () => new GroqProvider(),
  },
): AIProvider {
  if (name === 'openai') return constructors.openai();
  if (name === 'gemini') return constructors.gemini();
  if (name === 'groq') return constructors.groq();
  // Do not echo an arbitrary environment value: it could contain a secret.
  throw new AIProviderConfigError('Unsupported AI_PROVIDER. Use openai, gemini, or groq.');
}
