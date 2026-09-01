import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import {
  ProfilerUnavailableError,
  ProfilerTimeoutError,
  ProfilerHttpError,
  ProfilerInvalidResponseError
} from './fastapi-profiler.errors';

export class FastAPIProfilerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';
    this.timeoutMs = parseInt(process.env.FASTAPI_TIMEOUT_MS || '10000', 10);
  }

  async profile(filePath: string): Promise<any> {
    const formData = new FormData();
    // Use a generic filename to avoid exposing local filesystem paths
    formData.append('file', fs.createReadStream(filePath), { filename: 'upload.csv' });

    try {
      const response = await axios.post(`${this.baseUrl}/profile`, formData, {
        headers: formData.getHeaders(),
        timeout: this.timeoutMs,
      });

      if (!response.data || typeof response.data !== 'object' || Object.keys(response.data).length === 0) {
        throw new ProfilerInvalidResponseError('Malformed or empty response from profiler');
      }

      return response.data;
    } catch (error: unknown) {
      if (error instanceof ProfilerInvalidResponseError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.code === 'ECONNABORTED') {
          throw new ProfilerTimeoutError(`Profiler request timed out after ${this.timeoutMs}ms`);
        }
        
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
          throw new ProfilerUnavailableError('Profiler service is unreachable');
        }

        if (axiosError.response) {
          throw new ProfilerHttpError(`Profiler returned non-2xx response: ${axiosError.response.status}`);
        }
      }

      throw new ProfilerUnavailableError('An unexpected error occurred while communicating with the profiler');
    }
  }
}
