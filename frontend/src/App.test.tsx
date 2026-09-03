import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { PersistedDataset } from './types/profiler';

const mockUploadDataset = vi.fn();
const mockGetDatasetHistory = vi.fn();
const mockGetDatasetById = vi.fn();
const mockDeleteDataset = vi.fn();

const savedDataset = {
  id: 'saved-dataset-1',
  originalFilename: 'customers.csv',
  createdAt: '2026-09-02T10:30:00.000Z',
  healthScore: 88,
  profilerVersion: 'testpilot-profiler-v1',
};

const savedReport: PersistedDataset = {
  ...savedDataset,
  storedFilename: 'generated.csv',
  report: {
    profiler_version: 'testpilot-profiler-v1',
    file_summary: {
      file_sha256: 'saved-hash', size_bytes: 256, row_count: 12, column_count: 3,
      duplicate_row_count: 1, encoding: 'utf-8', delimiter: ',', header_quality: 'good'
    },
    health_score: { score: 88, deductions: { duplicate_rows: 12 }, scoring_version: 'score-v1' },
    severity_totals: { info: 0, warning: 1, error: 0 },
    findings: [{ rule_id: 'duplicate_rows.v1', severity: 'warning', column: null, metrics: {} }],
    column_profiles: [],
  },
};

vi.mock('./services/api', () => ({
  uploadDataset: (...args: unknown[]) => mockUploadDataset(...args),
  getDatasetHistory: (...args: unknown[]) => mockGetDatasetHistory(...args),
  getDatasetById: (...args: unknown[]) => mockGetDatasetById(...args),
  deleteDataset: (...args: unknown[]) => mockDeleteDataset(...args),
}));

describe('TestPilot app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatasetHistory.mockResolvedValue([]);
    mockDeleteDataset.mockResolvedValue(undefined);
  });

  it('renders the upload panel', async () => {
    render(<App />);
    expect(screen.getByText(/Data Quality & Testing/i)).toBeInTheDocument();
    expect(screen.getByText(/Analyze your CSV/i)).toBeInTheDocument();
    expect(await screen.findByText(/No saved datasets yet/i)).toBeInTheDocument();
  });

  it('rejects invalid non-CSV file selection', async () => {
    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await userEvent.upload(input, file);

    expect(screen.getByText(/Only CSV files are supported./i)).toBeInTheDocument();
  });

  it('accepts a valid CSV file selection', async () => {
    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);

    expect(screen.getByText('sample.csv')).toBeInTheDocument();
  });

  it('shows loading state while uploading', async () => {
    mockUploadDataset.mockImplementation(() => new Promise(() => undefined));

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    expect(screen.getByRole('button', { name: /Processing/i })).toBeDisabled();
  });

  it('renders a successful health report', async () => {
    mockUploadDataset.mockResolvedValue({
      datasetId: 'uploaded-dataset-1',
      profiler_version: 'testpilot-profiler-v1',
      file_summary: {
        file_sha256: 'abc',
        size_bytes: 128,
        row_count: 3,
        column_count: 2,
        duplicate_row_count: 0,
        encoding: 'utf-8',
        delimiter: ',',
        header_quality: 'good'
      },
      health_score: {
        score: 96,
        deductions: {},
        scoring_version: 'score-v1'
      },
      severity_totals: { info: 0, warning: 1, error: 0 },
      findings: [
        { rule_id: 'missing_values.v1', severity: 'warning', column: 'name', metrics: { percentage: 10 } }
      ],
      column_profiles: [
        {
          column_name: 'name',
          inferred_type: 'string',
          null_count: 0,
          null_percentage: 0,
          empty_string_count: 0,
          distinct_count: 2,
          distinct_percentage: 100,
          duplicate_value_rate: 0,
          invalid_parsed_value_count: 0,
          samples: ['Ada', 'Ben']
        }
      ]
    });

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n2,Ben\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    expect(await screen.findByText('96')).toBeInTheDocument();
    expect(screen.getByText(/Current upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Dataset ID uploaded-dataset-1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/missing_values.v1/i).length).toBeGreaterThan(0);
  });

  it('renders empty findings state', async () => {
    mockUploadDataset.mockResolvedValue({
      profiler_version: 'testpilot-profiler-v1',
      file_summary: {
        file_sha256: 'abc',
        size_bytes: 128,
        row_count: 3,
        column_count: 2,
        duplicate_row_count: 0,
        encoding: 'utf-8',
        delimiter: ',',
        header_quality: 'good'
      },
      health_score: {
        score: 100,
        deductions: {},
        scoring_version: 'score-v1'
      },
      severity_totals: { info: 0, warning: 0, error: 0 },
      findings: [],
      column_profiles: []
    });

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n2,Ben\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    expect(await screen.findByText(/Your dataset looks healthy/i)).toBeInTheDocument();
  });

  it('renders column profiles', async () => {
    mockUploadDataset.mockResolvedValue({
      profiler_version: 'testpilot-profiler-v1',
      file_summary: {
        file_sha256: 'abc',
        size_bytes: 128,
        row_count: 3,
        column_count: 1,
        duplicate_row_count: 0,
        encoding: 'utf-8',
        delimiter: ',',
        header_quality: 'good'
      },
      health_score: {
        score: 90,
        deductions: {},
        scoring_version: 'score-v1'
      },
      severity_totals: { info: 0, warning: 0, error: 0 },
      findings: [],
      column_profiles: [
        {
          column_name: 'amount',
          inferred_type: 'number',
          null_count: 0,
          null_percentage: 0,
          empty_string_count: 0,
          distinct_count: 3,
          distinct_percentage: 100,
          duplicate_value_rate: 0,
          invalid_parsed_value_count: 0,
          numeric_statistics: { mean: 2, min: 1, max: 3 }
        }
      ]
    });

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['amount\n1\n2\n3\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    expect(await screen.findByText('amount')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /amount/i }));
    expect(await screen.findByText(/mean/i)).toBeInTheDocument();
  });

  it('renders API error state', async () => {
    mockUploadDataset.mockRejectedValue(new Error('Backend unavailable'));

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    expect(await screen.findByText(/Backend unavailable/i)).toBeInTheDocument();
  });

  it('allows a new upload after a report', async () => {
    mockUploadDataset.mockResolvedValue({
      profiler_version: 'testpilot-profiler-v1',
      file_summary: {
        file_sha256: 'abc',
        size_bytes: 128,
        row_count: 3,
        column_count: 2,
        duplicate_row_count: 0,
        encoding: 'utf-8',
        delimiter: ',',
        header_quality: 'good'
      },
      health_score: { score: 100, deductions: {}, scoring_version: 'score-v1' },
      severity_totals: { info: 0, warning: 0, error: 0 },
      findings: [],
      column_profiles: []
    });

    render(<App />);
    const input = screen.getByLabelText(/Choose a CSV file/i);
    const file = new File(['id,name\n1,Ada\n'], 'sample.csv', { type: 'text/csv' });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));
    await screen.findByText('100');
    await userEvent.click(screen.getByRole('button', { name: /Analyze another dataset/i }));

    expect(screen.getByText(/Analyze your CSV/i)).toBeInTheDocument();
  });

  it('shows a loading state while fetching history', () => {
    mockGetDatasetHistory.mockImplementation(() => new Promise(() => undefined));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved datasets');
  });

  it('shows an empty history state', async () => {
    render(<App />);
    expect(await screen.findByText(/No saved datasets yet/i)).toBeInTheDocument();
  });

  it('shows a history API error with a retry action', async () => {
    mockGetDatasetHistory.mockRejectedValueOnce(new Error('History service unavailable'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('History service unavailable');
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });

  it('loads and displays a saved report when a history item is selected', async () => {
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    let resolveReport: (dataset: PersistedDataset) => void = () => undefined;
    mockGetDatasetById.mockImplementationOnce(() => new Promise<PersistedDataset>((resolve) => {
      resolveReport = resolve;
    }));
    render(<App />);

    const historyItem = await screen.findByRole('button', { name: /Open saved dataset customers.csv/i });
    await userEvent.click(historyItem);

    expect(await screen.findByText(/Loading saved report/i)).toBeInTheDocument();
    resolveReport(savedReport);
    expect(await screen.findByText('customers.csv')).toBeInTheDocument();
    expect(screen.getByText('Saved Dataset')).toBeInTheDocument();
    expect(screen.getAllByText(/Saved report/i).length).toBeGreaterThan(0);
    expect(mockGetDatasetById).toHaveBeenCalledWith('saved-dataset-1');
  });

  it('returns from a historical report to the history and upload view', async () => {
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    mockGetDatasetById.mockResolvedValueOnce(savedReport);
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Open saved dataset customers.csv/i }));
    await screen.findByText('Saved Dataset');
    await userEvent.click(screen.getByRole('button', { name: /Back to history/i }));

    expect(screen.getByText(/Analyze your CSV/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open saved dataset customers.csv/i })).toBeInTheDocument();
  });

  it('shows an error when a saved report cannot be loaded', async () => {
    mockGetDatasetHistory.mockResolvedValueOnce([savedDataset]);
    mockGetDatasetById.mockRejectedValueOnce(new Error('Saved report not found'));
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Open saved dataset customers.csv/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved report not found');
    expect(screen.getByText(/Report unavailable/i)).toBeInTheDocument();
  });

  it('refreshes history after a successful upload', async () => {
    mockGetDatasetHistory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([savedDataset]);
    mockUploadDataset.mockResolvedValueOnce({
      ...savedReport.report,
      datasetId: savedDataset.id,
    });
    render(<App />);

    const input = screen.getByLabelText(/Choose a CSV file/i);
    await userEvent.upload(input, new File(['id\n1\n'], 'customers.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: /Analyze dataset/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Open saved dataset customers.csv/i })).toBeInTheDocument());
    expect(mockGetDatasetHistory).toHaveBeenCalledTimes(2);
  });

  it('renders a delete action and opens a confirmation dialog', async () => {
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Delete dataset customers.csv/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot be undone');
    expect(screen.getByRole('button', { name: /Cancel/i })).toHaveFocus();
  });

  it('cancels deletion without calling the API', async () => {
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Delete dataset customers.csv/i }));
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDeleteDataset).not.toHaveBeenCalled();
  });

  it('deletes a non-active dataset and refreshes history', async () => {
    const otherDataset = { ...savedDataset, id: 'saved-dataset-2', originalFilename: 'orders.csv' };
    let deletionFinished = false;
    mockGetDatasetHistory.mockImplementation(() => Promise.resolve(deletionFinished ? [savedDataset] : [savedDataset, otherDataset]));
    mockDeleteDataset.mockImplementationOnce(async () => {
      deletionFinished = true;
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Delete dataset orders.csv/i }));
    await userEvent.click(screen.getByRole('button', { name: /Delete dataset$/i }));

    await waitFor(() => expect(mockDeleteDataset).toHaveBeenCalledWith('saved-dataset-2'));
    expect(screen.queryByRole('button', { name: /Delete dataset orders.csv/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open saved dataset customers.csv/i })).toBeInTheDocument();
  });

  it('clears the active historical report when it is deleted', async () => {
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    mockGetDatasetById.mockResolvedValue(savedReport);
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Open saved dataset customers.csv/i }));
    expect(await screen.findByText('Saved Dataset')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Delete dataset customers.csv/i }));
    await userEvent.click(screen.getByRole('button', { name: /Delete dataset$/i }));

    await waitFor(() => expect(mockDeleteDataset).toHaveBeenCalledWith('saved-dataset-1'));
    expect(screen.getByText(/Analyze your CSV/i)).toBeInTheDocument();
    expect(screen.queryByText('Saved Dataset')).not.toBeInTheDocument();
  });

  it('shows a deletion loading state and surfaces deletion errors', async () => {
    let rejectDeletion: (error: Error) => void = () => undefined;
    mockGetDatasetHistory.mockResolvedValue([savedDataset]);
    mockDeleteDataset.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectDeletion = reject; }));
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Delete dataset customers.csv/i }));
    await userEvent.click(screen.getByRole('button', { name: /Delete dataset$/i }));
    expect(screen.getByRole('button', { name: /Deleting/i })).toBeDisabled();
    rejectDeletion(new Error('Delete request failed'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Delete request failed');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
