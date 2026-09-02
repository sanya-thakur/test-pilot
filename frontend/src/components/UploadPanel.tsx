import { useState, type ChangeEvent, type DragEvent } from 'react';

interface UploadPanelProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onUpload: () => void;
  isUploading: boolean;
  error: string | null;
}

export function UploadPanel({ file, onFileSelect, onUpload, isUploading, error }: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = (candidate: File | null) => {
    if (!candidate) {
      return 'Please select a CSV file.';
    }

    const validType = candidate.type === 'text/csv' || candidate.type === 'application/csv' || candidate.name.toLowerCase().endsWith('.csv');
    if (!validType) {
      return 'Only CSV files are supported.';
    }

    return null;
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected) {
      onFileSelect(selected);
    }
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0] ?? null;
    if (selected) {
      onFileSelect(selected);
    }
  };

  const localError = file ? validateFile(file) : null;
  const showError = error ?? localError;

  return (
    <section aria-label="Upload dataset" className="panel upload-panel">
      <div className="upload-copy">
        <p className="eyebrow">Upload Dataset</p>
        <h1>Analyze your CSV</h1>
        <p className="lead-copy">
          TestPilot profiles a CSV and surfaces the most important data-quality issues before they reach production.
        </p>
      </div>

      <label
        className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input type="file" onChange={handleInput} aria-label="Choose a CSV file" />
        <div className="dropzone-content">
          <div className="dropzone-icon" aria-hidden="true">CSV</div>
          <div className="dropzone-text">
            <strong>Drop a CSV here</strong>
            <span>or click to browse</span>
          </div>
          <div className="dropzone-meta">CSV files only</div>
        </div>
      </label>

      <div className="file-meta-row">
        {file ? (
          <>
            <div className="file-pill">{file.name}</div>
            <button type="button" className="ghost-button" onClick={() => onFileSelect(null)}>
              Remove
            </button>
          </>
        ) : (
          <span className="muted-copy">No file selected</span>
        )}
      </div>

      {file && (
        <div className="meta-row">
          <span>{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      )}

      {showError && <div className="error-box" role="alert">{showError}</div>}

      <button
        type="button"
        className="primary-button"
        onClick={onUpload}
        disabled={isUploading || !file || !!localError}
      >
        {isUploading ? 'Processing…' : 'Analyze dataset'}
      </button>
    </section>
  );
}
