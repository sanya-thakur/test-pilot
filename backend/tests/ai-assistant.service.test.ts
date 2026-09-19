import { AIAssistantService } from '../src/services/ai-assistant.service';
import type { AIProvider } from '../src/contracts/ai-provider.contract';
import type { AIReportContextService } from '../src/services/ai-report-context.service';

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

  describe('askDatasetQuestion', () => {
    it('returns null if dataset report context is not found', async () => {
      const mockProvider: AIProvider = {
        providerName: 'mock',
        modelName: 'mock',
        generateResponse: jest.fn(),
      };
      const mockContextService = {
        getAIReportContext: jest.fn().mockResolvedValue(null),
      } as unknown as AIReportContextService;

      const service = new AIAssistantService(mockProvider, mockContextService);
      const res = await service.askDatasetQuestion('missing-id', 'What is the quality?');

      expect(res).toBeNull();
      expect(mockContextService.getAIReportContext).toHaveBeenCalledWith('missing-id');
      expect(mockProvider.generateResponse).not.toHaveBeenCalled();
    });

    it('loads report context, builds system prompt, calls provider, and returns answer', async () => {
      const mockReportContext: any = {
        datasetId: 'ds-123',
        originalFilename: 'data.csv',
        rowCount: 100,
        columnCount: 5,
        healthScore: 90,
      };

      const mockProvider: AIProvider = {
        providerName: 'mock-provider',
        modelName: 'mock-model',
        generateResponse: jest.fn().mockResolvedValue({
          text: 'The dataset health score is 90 with 100 rows.',
          model: 'mock-model',
          provider: 'mock-provider',
        }),
      };

      const mockContextService = {
        getAIReportContext: jest.fn().mockResolvedValue(mockReportContext),
      } as unknown as AIReportContextService;

      const service = new AIAssistantService(mockProvider, mockContextService);
      const res = await service.askDatasetQuestion('ds-123', 'Summarize dataset');

      expect(res).toEqual({
        datasetId: 'ds-123',
        message: 'Summarize dataset',
        answer: 'The dataset health score is 90 with 100 rows.',
      });

      expect(mockProvider.generateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Summarize dataset',
          reportContext: mockReportContext,
          systemPrompt: expect.stringContaining("TestPilot's AI data-quality assistant"),
        })
      );
    });
  });
});

