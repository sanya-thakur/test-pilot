import { useEffect, useRef, useState } from 'react';
import type { DatasetSummary } from '../types/profiler';

interface DatasetHistoryProps {
  datasets: DatasetSummary[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (dataset: DatasetSummary) => void;
  onDelete: (dataset: DatasetSummary) => Promise<void>;
  onRetry: () => void;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const scoreTone = (score: number) => score >= 90 ? 'healthy' : score >= 60 ? 'warning' : 'error';

export function DatasetHistory({ datasets, selectedId, isLoading, error, onSelect, onDelete, onRetry }: DatasetHistoryProps) {
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!datasetToDelete) return;

    cancelButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) setDatasetToDelete(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [datasetToDelete, isDeleting]);

  const confirmDelete = async () => {
    if (!datasetToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(datasetToDelete);
      setDatasetToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The dataset could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
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
            <div className={`history-item ${selectedId === dataset.id ? 'is-selected' : ''}`} key={dataset.id}>
              <button
                type="button"
                className="history-open-button"
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
              <button
                type="button"
                className="delete-button"
                onClick={() => {
                  setDeleteError(null);
                  setDatasetToDelete(dataset);
                }}
                aria-label={`Delete dataset ${dataset.originalFilename}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      </aside>
      {datasetToDelete && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
            <p className="eyebrow">Delete dataset</p>
            <h2 id="delete-dialog-title">Delete {datasetToDelete.originalFilename}?</h2>
            <p className="muted-copy">This will permanently remove the saved report. This action cannot be undone.</p>
            {deleteError && <div className="error-box" role="alert">{deleteError}</div>}
            <div className="modal-actions">
              <button type="button" className="ghost-button" ref={cancelButtonRef} onClick={() => setDatasetToDelete(null)} disabled={isDeleting}>Cancel</button>
              <button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete dataset'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}