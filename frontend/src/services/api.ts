import type { DatasetSummary, PersistedDataset, UploadedProfilerResponse } from '../types/profiler';

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
