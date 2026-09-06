import { AIAssistantService } from '../src/services/ai-assistant.service';
import type { AIProvider } from '../src/contracts/ai-provider.contract';

describe('AIAssistantService', () => {
  it('delegates response generation to the injected provider', async () => {
    const mockProvider: AIProvider = {
      providerName: 'mock-provider',
      modelName: 'mock-model',
      generateResponse: jest.fn().mockResolvedValue({
        text: 'Injected provider response',
        model: 'mock-model',
        provider: 'mock-provider',
      }),
    };

    const service = new AIAssistantService(mockProvider);
    expect(service.getProvider()).toBe(mockProvider);

    const result = await service.generateResponse({ prompt: 'Hello service' });

    expect(result.text).toBe('Injected provider response');
    expect(mockProvider.generateResponse).toHaveBeenCalledWith({ prompt: 'Hello service' });
  });

  it('allows dynamic provider swapping via setProvider', async () => {
    const provider1: AIProvider = {
      providerName: 'p1',
      modelName: 'm1',
      generateResponse: jest.fn().mockResolvedValue({ text: 'p1 res', model: 'm1', provider: 'p1' }),
    };

    const provider2: AIProvider = {
      providerName: 'p2',
      modelName: 'm2',
      generateResponse: jest.fn().mockResolvedValue({ text: 'p2 res', model: 'm2', provider: 'p2' }),
    };

    const service = new AIAssistantService(provider1);
    const res1 = await service.generateResponse({ prompt: 'q1' });
    expect(res1.text).toBe('p1 res');

    service.setProvider(provider2);
    expect(service.getProvider()).toBe(provider2);

    const res2 = await service.generateResponse({ prompt: 'q2' });
    expect(res2.text).toBe('p2 res');
  });
});
