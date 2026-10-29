import type { DatasetSummary, PersistedDataset, UploadedProfilerResponse } from '../types/profiler';
import type { AIAssistantRequest, AIAssistantResponse } from '../types/ai-assistant';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

const getErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const text = await response.text();

  try {
    const payload = JSON.parse(text) as { error?: string };
    return typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;
  } catch {
    return fallback;
  }
};

export async function askAIAssistant(
  datasetId: string,
  message: string,
  signal?: AbortSignal,
): Promise<AIAssistantResponse> {
  const body: AIAssistantRequest = { message: message.trim() };
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/datasets/${encodeURIComponent(datasetId)}/ai-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Assistant request cancelled.', 'AbortError');
    throw new Error('Could not reach the assistant. Check your connection and try again.');
  }
  if (!response.ok) {
    // Use status-based copy rather than displaying arbitrary upstream payloads,
    // which could contain provider details or credentials.
    const errors: Record<number, string> = {
      400: 'Enter a question between 1 and 2,000 characters.',
      404: 'This saved dataset is no longer available. Open another report.',
      502: 'The AI provider could not answer right now. Please try again.',
      503: 'The assistant is not configured. Ask the server administrator to check the AI provider settings.',
      504: 'The assistant timed out. Please try again.',
    };
    throw new Error(errors[response.status] ?? 'The assistant is unavailable right now. Please try again.');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Malformed assistant response received from the backend.');
  }
  if (!data || typeof data !== 'object'
    || !('datasetId' in data) || data.datasetId !== datasetId
    || !('message' in data) || typeof data.message !== 'string' || data.message !== body.message
    || !('answer' in data) || typeof data.answer !== 'string' || !data.answer.trim()) {
    throw new Error('Malformed assistant response received from the backend.');
  }
  return { datasetId: data.datasetId, message: data.message, answer: data.answer };
}

export async function uploadDataset(file: File): Promise<UploadedProfilerResponse> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/profile`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'TestPilot could not process this dataset right now. Please try again.'));
  }

  const data = (await response.json()) as UploadedProfilerResponse;
  if (!data || typeof data !== 'object' || !data.profiler_version || typeof data.datasetId !== 'string' || !data.datasetId) {
    throw new Error('Malformed response received from the backend.');
  }

  return data;
}

export async function getDatasetHistory(): Promise<DatasetSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets`);

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Dataset history could not be loaded.'));
  }

  const data = (await response.json()) as DatasetSummary[];
  if (!Array.isArray(data)) {
    throw new Error('Malformed dataset history received from the backend.');
  }

  return data;
}

export async function getDatasetById(id: string): Promise<PersistedDataset> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'The saved dataset could not be loaded.'));
  }

  const data = (await response.json()) as PersistedDataset;
  if (!data || typeof data !== 'object' || !data.report || !data.id) {
    throw new Error('Malformed saved dataset received from the backend.');
  }

  return data;
}

export async function deleteDataset(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'The dataset could not be deleted.'));
  }
}

export async function getHealthStatus(): Promise<{ status: string; service: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health`);

  if (!response.ok) {
    throw new Error('Health check failed.');
  }

  return (await response.json()) as { status: string; service: string };
}
