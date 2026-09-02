import { useMemo, useState } from 'react';
import { UploadPanel } from './components/UploadPanel';
import { HealthReport } from './components/HealthReport';
import { uploadDataset } from './services/api';
import type { ProfilerResponse } from './types/profiler';

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<ProfilerResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(selectedFile), [selectedFile]);

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
        {!report ? (
          <UploadPanel
            file={selectedFile}
            onFileSelect={setSelectedFile}
            onUpload={handleUpload}
            isUploading={isUploading}
            error={error}
          />
        ) : (
          <HealthReport report={report} onReset={handleReset} />
        )}
      </main>

      <footer className="footer-note">
        {canSubmit ? 'CSV upload ready' : 'Upload a CSV to begin profiling'}
      </footer>
    </div>
  );
}

export default App;
