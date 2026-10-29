import { AIAssistantService } from '../src/services/ai-assistant.service';
import { AIProviderError, type AIProvider } from '../src/contracts/ai-provider.contract';
import type { AIReportContextService } from '../src/services/ai-report-context.service';
import { GeminiProvider } from '../src/providers/gemini.provider';

describe('AIAssistantService', () => {
  it('uses the configured factory default while injection overrides configuration', () => {
    const previous = process.env.AI_PROVIDER;
    try {
      process.env.AI_PROVIDER = 'gemini';
      expect(new AIAssistantService().getProvider()).toBeInstanceOf(GeminiProvider);
      process.env.AI_PROVIDER = 'unsupported';
      const injected: AIProvider = {
        providerName: 'injected', modelName: 'test', generateResponse: jest.fn(),
      };
      const service = new AIAssistantService(injected);
      expect(service.getProvider()).toBe(injected);
      service.setProvider(new GeminiProvider());
      expect(service.getProvider()).toBeInstanceOf(GeminiProvider);
    } finally {
      if (previous === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previous;
    }
  });
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
      const info = jest.spyOn(console, 'info').mockImplementation(() => {});
      const mockReportContext: any = {
        datasetId: 'ds-123',
        id: 'ds-123',
        originalFilename: 'data.csv',
        rowCount: 100,
        columnCount: 5,
        duplicateRowCount: 0,
        healthScore: 90,
        healthScoreDeductions: {},
        scoringVersion: 'v1',
        severityTotals: { info: 0, warning: 0, error: 0 },
        findings: [],
        columnProfiles: [],
        profilerVersion: 'testpilot-profiler-v1',
        createdAt: '2026-10-29T00:00:00.000Z',
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
          reportContext: expect.objectContaining({ datasetId: 'ds-123', originalFilename: 'data.csv' }),
          systemPrompt: expect.stringContaining("TestPilot's AI data-quality assistant"),
          requestId: expect.any(String),
        })
      );
      expect(info).toHaveBeenCalledWith('[AIAssistantService] Request completed', expect.objectContaining({
        requestId: expect.any(String), provider: 'mock-provider', outcome: 'success',
        contextDurationMs: expect.any(Number), providerDurationMs: expect.any(Number), totalDurationMs: expect.any(Number),
      }));
      expect(JSON.stringify(info.mock.calls)).not.toContain('Summarize dataset');
      expect(JSON.stringify(info.mock.calls)).not.toContain('data.csv');
    });

    it('logs a safe context-stage failure without invoking the provider', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const provider: AIProvider = { providerName: 'mock-provider', modelName: 'mock-model', generateResponse: jest.fn() };
      const contextService = {
        getAIReportContext: jest.fn().mockRejectedValue(new Error('sensitive context details')),
      } as unknown as AIReportContextService;
      const service = new AIAssistantService(provider, contextService);

      await expect(service.askDatasetQuestion('dataset-sensitive-id', 'sensitive question')).rejects.toThrow('sensitive context details');
      expect(provider.generateResponse).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('[AIAssistantService] Context loading failed', expect.objectContaining({
        requestId: expect.any(String), provider: 'mock-provider', stage: 'context', durationMs: expect.any(Number),
      }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain('dataset-sensitive-id');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive context details');
    });

    it('logs a safe provider-stage failure after context loading', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const provider: AIProvider = {
        providerName: 'mock-provider', modelName: 'mock-model',
        generateResponse: jest.fn().mockRejectedValue(new AIProviderError('sensitive provider details')),
      };
      const contextService = {
        getAIReportContext: jest.fn().mockResolvedValue({
          datasetId: 'dataset-id',
          id: 'dataset-id',
          originalFilename: 'data.csv',
          rowCount: 0,
          columnCount: 0,
          duplicateRowCount: 0,
          healthScore: 100,
          healthScoreDeductions: {},
          scoringVersion: 'v1',
          severityTotals: { info: 0, warning: 0, error: 0 },
          findings: [],
          columnProfiles: [],
          profilerVersion: 'testpilot-profiler-v1',
          createdAt: '2026-10-29T00:00:00.000Z',
        }),
      } as unknown as AIReportContextService;
      const service = new AIAssistantService(provider, contextService);

      await expect(service.askDatasetQuestion('dataset-id', 'sensitive question')).rejects.toBeInstanceOf(AIProviderError);
      expect(warn).toHaveBeenCalledWith('[AIAssistantService] Provider execution failed', expect.objectContaining({
        requestId: expect.any(String), provider: 'mock-provider', stage: 'provider',
        contextDurationMs: expect.any(Number), providerDurationMs: expect.any(Number), totalDurationMs: expect.any(Number),
      }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain('dataset-id');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive question');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive provider details');
    });
  });
});

