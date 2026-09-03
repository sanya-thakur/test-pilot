import { useEffect, useMemo, useState } from 'react';
import { UploadPanel } from './components/UploadPanel';
import { HealthReport } from './components/HealthReport';
import { DatasetHistory } from './components/DatasetHistory';
import { getDatasetById, getDatasetHistory, uploadDataset } from './services/api';
import type { DatasetSummary, ProfilerResponse } from './types/profiler';

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<ProfilerResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DatasetSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedDatasetName, setSelectedDatasetName] = useState<string | null>(null);
  const [reportMode, setReportMode] = useState<'current' | 'historical' | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(selectedFile), [selectedFile]);

  const refreshHistory = async () => {
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await getDatasetHistory());
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : 'Dataset history could not be loaded.');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a CSV file before uploading.');
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const nextReport = await uploadDataset(selectedFile);
      setReport(nextReport);
      setSelectedDatasetId(nextReport.datasetId);
      setSelectedDatasetName(selectedFile.name);
      setReportMode('current');
      setReportError(null);
      await refreshHistory();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'TestPilot could not process this dataset right now. Please try again.';
      setError(message);
      setReport(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setReport(null);
    setSelectedFile(null);
    setError(null);
    setSelectedDatasetId(null);
    setSelectedDatasetName(null);
    setReportMode(null);
    setReportError(null);
  };

  const handleHistorySelect = async (dataset: DatasetSummary) => {
    setSelectedDatasetId(dataset.id);
    setSelectedDatasetName(dataset.originalFilename);
    setReportMode('historical');
    setReport(null);
    setReportError(null);
    setIsReportLoading(true);

    try {
      const savedDataset = await getDatasetById(dataset.id);
      setReport(savedDataset.report);
    } catch (historyLoadError) {
      setReportError(historyLoadError instanceof Error ? historyLoadError.message : 'The saved dataset could not be loaded.');
    } finally {
      setIsReportLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="TestPilot home">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-name">TestPilot</div>
            <div className="brand-subtitle">Data Quality &amp; Testing</div>
          </div>
        </div>
      </header>

      <main className="page-layout">
        <div className="workspace-grid">
          <DatasetHistory
            datasets={history}
            selectedId={selectedDatasetId}
            isLoading={isHistoryLoading}
            error={historyError}
            onSelect={handleHistorySelect}
            onRetry={() => void refreshHistory()}
          />
          <section className="content-column">
            {isReportLoading ? (
              <div className="panel content-state" role="status">Loading saved report...</div>
            ) : reportError ? (
              <div className="panel content-state" role="alert">
                <p className="eyebrow">Saved Dataset</p>
                <h2>Report unavailable</h2>
                <p className="muted-copy">{reportError}</p>
                <button type="button" className="secondary-button" onClick={handleReset}>Return to upload</button>
              </div>
            ) : !report ? (
              <UploadPanel
                file={selectedFile}
                onFileSelect={setSelectedFile}
                onUpload={handleUpload}
                isUploading={isUploading}
                error={error}
              />
            ) : (
              <HealthReport
                report={report}
                onReset={handleReset}
                datasetId={selectedDatasetId ?? undefined}
                datasetName={selectedDatasetName ?? undefined}
                isHistorical={reportMode === 'historical'}
                onBackToHistory={handleReset}
              />
            )}
          </section>
        </div>
      </main>

      <footer className="footer-note">
        {canSubmit ? 'CSV upload ready' : 'Upload a CSV to begin profiling'}
      </footer>
    </div>
  );
}

export default App;
