import type { ProfilerResponse } from '../types/profiler';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

export async function uploadDataset(file: File): Promise<ProfilerResponse> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/profile`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = 'TestPilot could not process this dataset right now. Please try again.';

    try {
      const payload = JSON.parse(text) as { error?: string };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // ignore JSON parse errors and keep safe message
    }

    throw new Error(message);
  }

  const data = (await response.json()) as ProfilerResponse;
  if (!data || typeof data !== 'object' || !data.profiler_version) {
    throw new Error('Malformed response received from the backend.');
  }

  return data;
}

export async function getHealthStatus(): Promise<{ status: string; service: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health`);

  if (!response.ok) {
    throw new Error('Health check failed.');
  }

  return (await response.json()) as { status: string; service: string };
}
