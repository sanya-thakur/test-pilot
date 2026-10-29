import { useEffect, useState } from 'react';
import { getProjects, ingestProject, type ProjectOverview } from '../services/api';

export function ProjectIngestionPanel() {
  const [file, setFile] = useState<File | null>(null); const [projects, setProjects] = useState<ProjectOverview[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void getProjects().then(setProjects).catch(() => setError('Project history could not be loaded.')); }, []);
  const submit = async () => { if (!file) return; setBusy(true); setError(null); try { const project = await ingestProject(file); setProjects((items) => [project, ...items]); setFile(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project ingestion could not be completed.'); } finally { setBusy(false); } };
  const latest = projects[0];
  return <section className="panel upload-panel" aria-label="Project ingestion">
    <div className="upload-copy"><p className="eyebrow">Project Ingestion</p><h2>Inventory a source ZIP</h2><p className="lead-copy">TestPilot safely inventories source files; it never executes uploaded code.</p></div>
    <input aria-label="Choose a project ZIP" type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    {file && <div className="file-pill">{file.name}</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <button className="primary-button" type="button" disabled={!file || busy || !file.name.toLowerCase().endsWith('.zip')} onClick={() => void submit()}>{busy ? 'Inspecting…' : 'Ingest project ZIP'}</button>
    {latest && <div className="detail-metrics"><strong>{latest.originalFilename}</strong><span>{latest.fileCount} files · {latest.languages.join(', ') || 'No source language detected'}</span><span>Frameworks: {latest.frameworks.join(', ') || 'None detected'}</span><span>Routes: {latest.routes.length} · Schemas: {latest.schemas.length} · Tests: {latest.tests.length}</span></div>}
  </section>;
}
