import type { DatasetSummary } from '../types/profiler';

interface DatasetHistoryProps {
  datasets: DatasetSummary[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (dataset: DatasetSummary) => void;
  onRetry: () => void;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const scoreTone = (score: number) => score >= 90 ? 'healthy' : score >= 60 ? 'warning' : 'error';

export function DatasetHistory({ datasets, selectedId, isLoading, error, onSelect, onRetry }: DatasetHistoryProps) {
  return (
    <aside id="dataset-history" className="history-panel panel" aria-labelledby="dataset-history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="dataset-history-title">Dataset History</h2>
        </div>
        {!isLoading && !error && <span className="history-count">{datasets.length}</span>}
      </div>

      {isLoading ? (
        <div className="history-state" role="status">Loading saved datasets...</div>
      ) : error ? (
        <div className="history-state history-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ghost-button" onClick={onRetry}>Try again</button>
        </div>
      ) : datasets.length === 0 ? (
        <div className="history-state">
          <strong>No saved datasets yet</strong>
          <p>Your analyzed CSVs will appear here.</p>
        </div>
      ) : (
        <div className="history-list">
          {datasets.map((dataset) => (
            <button
              type="button"
              className={`history-item ${selectedId === dataset.id ? 'is-selected' : ''}`}
              key={dataset.id}
              onClick={() => onSelect(dataset)}
              aria-label={`Open saved dataset ${dataset.originalFilename}`}
              aria-current={selectedId === dataset.id ? 'true' : undefined}
            >
              <span className="history-item-topline">
                <strong>{dataset.originalFilename}</strong>
                <span className={`score-chip ${scoreTone(dataset.healthScore)}`}>{dataset.healthScore}</span>
              </span>
              <span className="history-item-meta">{formatDate(dataset.createdAt)}</span>
              <span className="history-item-id">ID {dataset.id}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}