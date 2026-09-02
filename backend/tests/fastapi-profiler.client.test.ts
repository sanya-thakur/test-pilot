import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerHttpError,
  ProfilerInvalidResponseError
} from '../src/clients/fastapi-profiler.errors';
import { parseProfilerResponse, type ProfilerResponseV1 } from '../src/contracts/profiler-response';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Always return true for isAxiosError if the object has isAxiosError=true
mockedAxios.isAxiosError = jest.fn((payload: any) => payload && payload.isAxiosError === true) as any;

describe('FastAPIProfilerClient', () => {
  const dummyFilePath = path.join(__dirname, 'dummy_client.csv');
  const validProfilerResponse: ProfilerResponseV1 = {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: {
      file_sha256: 'abc123',
      size_bytes: 128,
      row_count: 3,
      column_count: 2,
      duplicate_row_count: 1,
      encoding: 'utf-8',
      delimiter: ',',
      header_quality: 'good'
    },
    health_score: {
      score: 85,
      deductions: { missing_values: 10, duplicate_rows: 5 },
      scoring_version: 'score-v1'
    },
    severity_totals: {
      info: 1,
      warning: 2,
      error: 0
    },
    findings: [{
      rule_id: 'missing_values.v1',
      severity: 'warning',
      column: 'name',
      metrics: { percentage: 12.5 }
    }],
    column_profiles: [{
      column_name: 'name',
      inferred_type: 'string',
      null_count: 0,
      null_percentage: 0,
      empty_string_count: 0,
      distinct_count: 2,
      distinct_percentage: 100,
      duplicate_value_rate: 0,
      invalid_parsed_value_count: 0,
      numeric_statistics: null,
      string_length_statistics: { min: 2, avg: 4, max: 6 },
      date_range: null,
      samples: ['Alice', 'Bob']
    }]
  };
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    fs.writeFileSync(dummyFilePath, 'id,name\n1,Test');
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FASTAPI_URL;
    delete process.env.FASTAPI_TIMEOUT_MS;
  });

  it('should use default URL and timeout if env vars are missing', async () => {
    const client = new FastAPIProfilerClient();
    mockedAxios.post.mockResolvedValueOnce({ data: validProfilerResponse });

    await client.profile(dummyFilePath);
    
    const [url, formData, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/profile');
    expect(config?.timeout).toBe(10000);
    // Note: formData validation is tricky due to streams, we'll verify it indirectly below
  });

  it('should respect configured FASTAPI_URL and FASTAPI_TIMEOUT_MS', async () => {
    process.env.FASTAPI_URL = 'http://fastapi-service:8080';
    process.env.FASTAPI_TIMEOUT_MS = '5000';
    
    const client = new FastAPIProfilerClient();
    mockedAxios.post.mockResolvedValueOnce({ data: validProfilerResponse });

    await client.profile(dummyFilePath);
    
    const [url, formData, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://fastapi-service:8080/profile');
    expect(config?.timeout).toBe(5000);
  });

  it('should successfully parse and return a valid response', async () => {
    const client = new FastAPIProfilerClient();
    mockedAxios.post.mockResolvedValueOnce({ data: validProfilerResponse });

    const result = await client.profile(dummyFilePath);
    expect(result).toEqual(validProfilerResponse);
  });

  it('should validate a valid profiler response contract', () => {
    expect(parseProfilerResponse(validProfilerResponse)).toEqual(validProfilerResponse);
  });

  it('should reject a profiler response with a missing required field', () => {
    const { profiler_version, ...rest } = validProfilerResponse;
    expect(() => parseProfilerResponse(rest)).toThrow();
  });

  it('should reject a profiler response with an incorrect field type', () => {
    expect(() => parseProfilerResponse({
      ...validProfilerResponse,
      health_score: { score: '85', deductions: {}, scoring_version: 'score-v1' }
    })).toThrow();
  });

  it('should reject a malformed nested finding', () => {
    expect(() => parseProfilerResponse({
      ...validProfilerResponse,
      findings: [{ rule_id: 'missing_values.v1', severity: 'critical' }]
    })).toThrow();
  });

  it('should reject a malformed column profile', () => {
    expect(() => parseProfilerResponse({
      ...validProfilerResponse,
      column_profiles: [{
        column_name: 'name',
        inferred_type: 'string',
        null_count: '0',
        null_percentage: 0,
        empty_string_count: 0,
        distinct_count: 2,
        distinct_percentage: 100,
        duplicate_value_rate: 0,
        invalid_parsed_value_count: 0,
        samples: ['Alice']
      }]
    })).toThrow();
  });

  it('should reject an unexpected invalid response shape', () => {
    expect(() => parseProfilerResponse({ ok: true })).toThrow();
    expect(() => parseProfilerResponse(null)).toThrow();
  });

  it('should throw ProfilerTimeoutError on ECONNABORTED', async () => {
    const client = new FastAPIProfilerClient();
    const error: any = new Error('timeout');
    error.isAxiosError = true;
    error.code = 'ECONNABORTED';
    mockedAxios.post.mockRejectedValueOnce(error);

    await expect(client.profile(dummyFilePath)).rejects.toThrow(ProfilerTimeoutError);
  });

  it('should throw ProfilerUnavailableError on ECONNREFUSED', async () => {
    const client = new FastAPIProfilerClient();
    const error: any = new Error('refused');
    error.isAxiosError = true;
    error.code = 'ECONNREFUSED';
    mockedAxios.post.mockRejectedValueOnce(error);

    await expect(client.profile(dummyFilePath)).rejects.toThrow(ProfilerUnavailableError);
  });

  it('should throw ProfilerHttpError on non-2xx HTTP response', async () => {
    const client = new FastAPIProfilerClient();
    const error: any = new Error('server error');
    error.isAxiosError = true;
    error.response = { status: 500 };
    mockedAxios.post.mockRejectedValueOnce(error);

    await expect(client.profile(dummyFilePath)).rejects.toThrow(ProfilerHttpError);
  });

  it('should throw ProfilerInvalidResponseError on empty or malformed data', async () => {
    const client = new FastAPIProfilerClient();
    mockedAxios.post.mockResolvedValueOnce({ data: null });

    await expect(client.profile(dummyFilePath)).rejects.toThrow(ProfilerInvalidResponseError);

    mockedAxios.post.mockResolvedValueOnce({ data: {} }); // empty object is malformed
    await expect(client.profile(dummyFilePath)).rejects.toThrow(ProfilerInvalidResponseError);
  });
});
