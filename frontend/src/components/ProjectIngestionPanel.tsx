import { useEffect, useRef, useState } from 'react';
import { askProjectAssistant, getProjects, ingestProject, type ProjectOverview } from '../services/api';

export function ProjectIngestionPanel() {
  const [file, setFile] = useState<File | null>(null); const [projects, setProjects] = useState<ProjectOverview[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [question, setQuestion] = useState(''); const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]); const [assistantError, setAssistantError] = useState<string | null>(null); const [isAsking, setIsAsking] = useState(false); const loadVersion = useRef(0);
  useEffect(() => { const version = ++loadVersion.current; void getProjects().then((items) => { if (version === loadVersion.current) { setProjects(items); setSelectedId((current) => current ?? items[0]?.id ?? null); } }).catch(() => setError('Project history could not be loaded.')); }, []);
  const submit = async () => { if (!file) return; setBusy(true); setError(null); try { const project = await ingestProject(file); loadVersion.current += 1; setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]); setSelectedId(project.id); setConversation([]); setAssistantError(null); setFile(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project ingestion could not be completed.'); } finally { setBusy(false); } };
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const ask = async () => { if (!selectedProject || !question.trim() || isAsking) return; const next = [...conversation, { role: 'user' as const, content: question.trim() }]; setConversation(next); setQuestion(''); setAssistantError(null); setIsAsking(true); try { const result = await askProjectAssistant(selectedProject.id, next.at(-1)!.content, conversation.slice(-12)); setConversation([...next, { role: 'assistant', content: result.answer }]); } catch (reason) { setAssistantError(reason instanceof Error ? reason.message : 'Project assistant could not answer right now.'); } finally { setIsAsking(false); } };
  return <section className="panel upload-panel" aria-label="Project ingestion">
    <div className="upload-copy"><p className="eyebrow">Project Ingestion</p><h2>Inventory a source ZIP</h2><p className="lead-copy">TestPilot safely inventories source files; it never executes uploaded code.</p></div>
    <input aria-label="Choose a project ZIP" type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    {file && <div className="file-pill">{file.name}</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <button className="primary-button" type="button" disabled={!file || busy || !file.name.toLowerCase().endsWith('.zip')} onClick={() => void submit()}>{busy ? 'Inspecting…' : 'Ingest project ZIP'}</button>
    <div className="project-workspace">
      <aside className="project-history" aria-label="Project history"><div className="history-heading"><h3>Projects</h3><span className="history-count">{projects.length}</span></div>{projects.length ? <div className="history-list">{projects.map((project) => <button className={`history-item ${project.id === selectedId ? 'is-selected' : ''}`} type="button" key={project.id} onClick={() => { setSelectedId(project.id); setConversation([]); setAssistantError(null); }}><strong>{project.originalFilename}</strong><span>{project.fileCount} files</span></button>)}</div> : <p className="muted-copy">Upload a ZIP to begin.</p>}</aside>
    {selectedProject && <div className="project-overview" aria-label="Project overview">
      <div className="project-overview-heading"><strong>{selectedProject.originalFilename}</strong><span>{selectedProject.fileCount} supported files inventoried</span></div>
      <div className="overview-grid">
        <div className="overview-stat"><span>Languages</span><strong>{selectedProject.languages.join(', ') || 'None detected'}</strong></div>
        <div className="overview-stat"><span>Frameworks</span><strong>{selectedProject.frameworks.join(', ') || 'None detected'}</strong></div>
        <div className="overview-stat"><span>Source size</span><strong>{(selectedProject.totalUncompressedBytes / 1024 / 1024).toFixed(1)} MB</strong></div>
      </div>
      <div className="project-inventory-grid">
        <Inventory label="Dependency manifests" entries={selectedProject.manifests} />
        <Inventory label="Routes" entries={selectedProject.routes} />
        <Inventory label="Schemas" entries={selectedProject.schemas} />
        <Inventory label="Tests" entries={selectedProject.tests} />
      </div>
      <Inventory label="Files (first 20)" entries={selectedProject.files.slice(0, 20).map((file) => file.path)} />
      <section className="project-inventory"><h3>Ask about this project</h3><p className="muted-copy">Answers cite the selected source files; code is never executed.</p><div className="assistant-answer" aria-live="polite">{conversation.map((item, index) => <p key={index}><strong>{item.role === 'user' ? 'You' : 'Assistant'}:</strong> {item.content}</p>)}{isAsking && <p className="assistant-status">Finding relevant files and asking the assistant…</p>}</div>{assistantError && <div className="error-box" role="alert">{assistantError}</div>}<textarea className="project-question" aria-label="Project question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about architecture, APIs, validation, tests, or files" disabled={isAsking} /><button className="secondary-button" type="button" onClick={() => void ask()} disabled={!question.trim() || isAsking}>{isAsking ? 'Asking…' : 'Ask project assistant'}</button></section>
    </div>}</div>
  </section>;
}

function Inventory({ label, entries }: { label: string; entries: string[] }) {
  return <section className="project-inventory"><h3>{label} <span>({entries.length})</span></h3>{entries.length ? <ul>{entries.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="muted-copy">None detected</p>}</section>;
}
