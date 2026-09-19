import request from 'supertest';
import app from '../src/app';
import { datasetProfileService } from '../src/services/dataset-profile.service';
import { aiAssistantService } from '../src/services/ai-assistant.service';
import {
  AIProviderAPIError,
  AIProviderConfigError,
  AIProviderError,
  AIProviderTimeoutError,
} from '../src/contracts/ai-provider.contract';

jest.mock('../src/services/dataset-profile.service', () => ({
  datasetProfileService: {
    findById: jest.fn(),
    list: jest.fn(),
    deleteDataset: jest.fn(),
  },
}));

describe('AI Assistant API Endpoint (POST /api/v1/datasets/:id/ai-assistant)', () => {
  const mockDatasetRecord = {
    id: 'test-ds-123',
    originalFilename: 'sales_data.csv',
    storedFilename: 'internal_secret_sales_data.csv',
    rowCount: 500,
    columnCount: 10,
    duplicateRowCount: 5,
    healthScore: 92,
    healthScoreDeductions: { duplicateRows: 8 },
    scoringVersion: 'v1',
    severityTotals: { info: 1, warning: 2, error: 0 },
    findings: [
      { ruleId: 'duplicate_rows', severity: 'warning', column: null, metrics: { count: 5 } },
    ],
    columnProfiles: [
      { columnName: 'id', inferredType: 'integer', nullCount: 0, distinctCount: 500 },
    ],
    profilerVersion: 'testpilot-profiler-v1',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (datasetProfileService.findById as jest.Mock).mockResolvedValue(mockDatasetRecord);
  });

  describe('Request validation', () => {
    it('returns 400 if message field is missing', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 if message is non-string', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 if message is an empty string', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty string');
    });

    it('returns 400 if message is whitespace-only', async () => {
      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: '   \n\t   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty string');
    });

    it('returns 400 if message exceeds 2000 characters', async () => {
      const longMessage = 'a'.repeat(2001);
      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('2000 characters');
    });
  });

  describe('Dataset lookup and 404 handling', () => {
    it('returns 404 if dataset is not found in persistent store', async () => {
      (datasetProfileService.findById as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/v1/datasets/nonexistent-id/ai-assistant')
        .send({ message: 'What are the main problems?' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Dataset not found' });
    });
  });

  describe('Successful AI responses', () => {
    it('returns 200 with structured response for valid request', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockResolvedValueOnce({
        text: 'The dataset has 5 duplicate rows causing minor health score deductions.',
        model: 'gpt-4o-mini',
        provider: 'openai',
      });

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'What are the main problems with this dataset?' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        datasetId: 'test-ds-123',
        message: 'What are the main problems with this dataset?',
        answer: 'The dataset has 5 duplicate rows causing minor health score deductions.',
      });

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      const callArg = mockGenerate.mock.calls[0][0];
      expect(callArg.prompt).toBe('What are the main problems with this dataset?');
      expect(callArg.systemPrompt).toContain("TestPilot's AI data-quality assistant");
      expect(callArg.reportContext).toBeDefined();
      expect(callArg.reportContext?.datasetId).toBe('test-ds-123');

      mockGenerate.mockRestore();
    });

    it('trims leading/trailing whitespace from valid input message', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockResolvedValueOnce({
        text: 'Summary of dataset issues.',
        model: 'gpt-4o-mini',
        provider: 'openai',
      });

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: '   Summarize dataset issues.   ' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Summarize dataset issues.');

      mockGenerate.mockRestore();
    });
  });

  describe('Provider error handling', () => {
    it('returns 504 on AIProviderTimeoutError', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockRejectedValueOnce(
        new AIProviderTimeoutError('OpenAI request timed out')
      );

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'How is column id?' });

      expect(res.status).toBe(504);
      expect(res.body.error).toBe('AI provider request timed out');

      mockGenerate.mockRestore();
    });

    it('returns 503 on AIProviderConfigError', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockRejectedValueOnce(
        new AIProviderConfigError('Missing API key')
      );

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'How is column id?' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('AI provider configuration error');

      mockGenerate.mockRestore();
    });

    it('returns 502 on AIProviderAPIError', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockRejectedValueOnce(
        new AIProviderAPIError('OpenAI API error', 500)
      );

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'How is column id?' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('AI provider returned an API error');

      mockGenerate.mockRestore();
    });

    it('returns 502 on generic AIProviderError', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockRejectedValueOnce(
        new AIProviderError('AI failure')
      );

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'How is column id?' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('AI provider error');

      mockGenerate.mockRestore();
    });
  });

  describe('Security and privacy boundaries', () => {
    it('does not leak storedFilename, system prompts, or credentials in API response', async () => {
      const mockGenerate = jest.spyOn(aiAssistantService, 'generateResponse').mockResolvedValueOnce({
        text: 'Analysis complete.',
        model: 'gpt-4o-mini',
        provider: 'openai',
      });

      const res = await request(app)
        .post('/api/v1/datasets/test-ds-123/ai-assistant')
        .send({ message: 'Check security bounds' });

      expect(res.status).toBe(200);
      expect(res.body.storedFilename).toBeUndefined();
      expect(res.body.stored_filename).toBeUndefined();
      expect(res.body.filePath).toBeUndefined();
      expect(res.body.systemPrompt).toBeUndefined();
      expect(res.body.apiKey).toBeUndefined();
      expect(res.body.reportContext).toBeUndefined();

      mockGenerate.mockRestore();
    });
  });

  describe('Safety with existing routes', () => {
    it('GET /:id/ai-context still functions properly', async () => {
      const res = await request(app).get('/api/v1/datasets/test-ds-123/ai-context');
      expect(res.status).toBe(200);
      expect(res.body.datasetId).toBe('test-ds-123');
    });

    it('GET /:id still functions properly', async () => {
      const res = await request(app).get('/api/v1/datasets/test-ds-123');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('test-ds-123');
    });
  });
});
