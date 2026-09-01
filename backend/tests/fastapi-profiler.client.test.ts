import { FastAPIProfilerClient } from '../src/clients/fastapi-profiler.client';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerHttpError,
  ProfilerInvalidResponseError
} from '../src/clients/fastapi-profiler.errors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Always return true for isAxiosError if the object has isAxiosError=true
mockedAxios.isAxiosError = jest.fn((payload: any) => payload && payload.isAxiosError === true) as any;

describe('FastAPIProfilerClient', () => {
  const dummyFilePath = path.join(__dirname, 'dummy_client.csv');
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
    mockedAxios.post.mockResolvedValueOnce({ data: { health_score: 95 } });

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
    mockedAxios.post.mockResolvedValueOnce({ data: { health_score: 90 } });

    await client.profile(dummyFilePath);
    
    const [url, formData, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://fastapi-service:8080/profile');
    expect(config?.timeout).toBe(5000);
  });

  it('should successfully parse and return a valid response', async () => {
    const client = new FastAPIProfilerClient();
    const mockReport = { file_summary: {}, health_score: 100 };
    mockedAxios.post.mockResolvedValueOnce({ data: mockReport });

    const result = await client.profile(dummyFilePath);
    expect(result).toEqual(mockReport);
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
