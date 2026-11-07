'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const HISTORY_KEY = 'vegah.queue-lab.jobs.v1';
const HISTORY_LIMIT = 20;
const MAX_TEXT_LENGTH = 4000;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
type Result = {
  characters: number;
  words: number;
  sentences: number;
  estimatedReadingSeconds: number;
};
type ApiJob = {
  id: string;
  status: JobStatus;
  result: Result | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
type JobView = ApiJob & { stale?: boolean; missing?: boolean };
type SavedJob = { id: string; submittedAt: string };
type ServiceState = 'checking' | 'online' | 'offline';

const samples = [
  { label: 'Release note', text: 'Version 2.4.1 is ready for review. It includes an API update, a background-worker fix, and a database migration note.' },
  { label: 'Incident update', text: 'At 09:14 UTC, queue latency rose above the alert threshold. The worker recovered after restart and all pending jobs completed.' },
  { label: 'Support note', text: 'A customer reported a delayed status update. The request was received, queued, processed, and saved successfully.' },
];

const initialJob: ApiJob = {
  id: '', status: 'queued', result: null, error: null, created_at: '', updated_at: '',
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  switch (name) {
    case 'grid': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'activity': return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>;
    case 'arrow': return <svg {...common}><path d="M7 17 17 7M7 7h10v10"/></svg>;
    case 'check': return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'copy': return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>;
    case 'refresh': return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg>;
    case 'server': return <svg {...common}><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/></svg>;
    case 'layers': return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
    case 'trash': return <svg {...common}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>;
    case 'alert': return <svg {...common}><path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>;
    case 'spark': return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1 2.5 2 1-2 1L19 21l-1-2.5-2-1 2-1 1-2.5Z"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function displayTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function extractMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string').join(' ');
  }
  return fallback;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued: 'Queued', running: 'Processing', completed: 'Completed', failed: 'Failed', missing: 'Unavailable',
  };
  return <span className={`status-badge status-${status}`}><span className="status-indicator" />{labels[status] ?? status}</span>;
}

function HealthBadge({ state, label }: { state: ServiceState; label: string }) {
  const copy = state === 'online' ? 'Operational' : state === 'offline' ? 'Unavailable' : 'Checking';
  return <span className={`health-badge health-${state}`} role="status" aria-live="polite"><span className="health-dot" />{label}<b>{copy}</b></span>;
}

export default function Home() {
  const [text, setText] = useState('');
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState({ api: 'checking' as ServiceState, dependencies: 'checking' as ServiceState, checkedAt: '' });
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const hydrated = useRef(false);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedId) ?? null, [jobs, selectedId]);
  const activeJobCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;

  const refreshHealth = useCallback(async () => {
    const checkedAt = new Date().toISOString();
    const [live, ready] = await Promise.allSettled([
      fetch('/health/live', { cache: 'no-store' }),
      fetch('/health/ready', { cache: 'no-store' }),
    ]);
    setHealth({
      api: live.status === 'fulfilled' && live.value.ok ? 'online' : 'offline',
      dependencies: ready.status === 'fulfilled' && ready.value.ok ? 'online' : 'offline',
      checkedAt,
    });
  }, []);

  const refreshJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (response.status === 404) return { id, missing: true } as const;
    if (!response.ok) throw new Error('Could not refresh this job. The last known status is shown.');
    return await response.json() as ApiJob;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let saved: SavedJob[] = [];
      try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');
        if (Array.isArray(parsed)) {
          saved = parsed.filter((item): item is SavedJob => Boolean(item && typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id))).slice(0, HISTORY_LIMIT);
        }
      } catch { saved = []; }

      if (!cancelled) {
        setJobs(saved.map((item) => ({ ...initialJob, id: item.id, created_at: item.submittedAt, stale: true })));
        setSelectedId(saved[0]?.id ?? '');
        setHistoryLoaded(true);
        hydrated.current = true;
      }
      const refreshed = await Promise.all(saved.map(async (item) => {
        try {
          const job = await refreshJob(item.id);
          return 'missing' in job ? ({ ...initialJob, id: item.id, created_at: item.submittedAt, missing: true } as JobView) : job as JobView;
        } catch {
          return { ...initialJob, id: item.id, created_at: item.submittedAt, stale: true } as JobView;
        }
      }));
      if (!cancelled) {
        setJobs((current) => {
          const refreshedById = new Map(refreshed.map((job) => [job.id, job]));
          const merged = current.map((job) => refreshedById.get(job.id) ?? job);
          const currentIds = new Set(merged.map((job) => job.id));
          return [...merged, ...refreshed.filter((job) => !currentIds.has(job.id))].slice(0, HISTORY_LIMIT);
        });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshJob]);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    if (!historyLoaded || !hydrated.current) return;
    const saved: SavedJob[] = jobs.filter((job) => !job.missing).slice(0, HISTORY_LIMIT).map((job) => ({ id: job.id, submittedAt: job.created_at || new Date().toISOString() }));
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(saved)); } catch { /* Storage can be disabled by the browser. */ }
  }, [jobs, historyLoaded]);

  const activeIds = jobs.filter((job) => !job.missing && (job.status === 'queued' || job.status === 'running')).map((job) => job.id).join(',');
  useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(',');
    const timer = window.setInterval(() => {
      for (const id of ids) {
        void refreshJob(id).then((job) => {
          setJobs((current) => current.map((item) => item.id === id ? ('missing' in job ? { ...item, missing: true, stale: false } : { ...job, stale: false }) : item));
        }).catch(() => {
          setJobs((current) => current.map((item) => item.id === id ? { ...item, stale: true } : item));
        });
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeIds, refreshJob]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || submitting) return;
    setSubmitting(true);
    setNotice('');
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* Keep the user-facing fallback below. */ }
      if (!response.ok) throw new Error(extractMessage(payload, 'The API did not confirm that this task was queued. Check the service status before trying again.'));
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof (payload as { id: unknown }).id !== 'string') {
        throw new Error('The API response did not include a job ID. The task may have been accepted; check recent jobs before resubmitting.');
      }
      const created = payload as { id: string; status: JobStatus };
      const next: JobView = { ...initialJob, id: created.id, status: created.status, created_at: new Date().toISOString(), stale: false };
      setJobs((current) => [next, ...current.filter((job) => job.id !== next.id)].slice(0, HISTORY_LIMIT));
      setSelectedId(next.id);
      setText('');
      setHistoryLoaded(true);
      hydrated.current = true;
      void refreshJob(next.id).then((job) => setJobs((current) => current.map((item) => item.id === next.id ? ('missing' in job ? { ...item, missing: true } : { ...job, stale: false }) : item))).catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The request could not be confirmed. Check recent jobs before submitting again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyId() {
    if (!selectedJob?.id) return;
    try {
      await navigator.clipboard.writeText(selectedJob.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { setNotice('Clipboard access is unavailable. You can select and copy the job ID.'); }
  }

  function clearHistory() {
    setJobs([]);
    setSelectedId('');
    try { window.localStorage.removeItem(HISTORY_KEY); } catch { /* No persistent storage to clear. */ }
  }

  const status = selectedJob?.missing ? 'missing' : selectedJob?.status ?? 'queued';
  const completedSteps = status === 'completed' ? 3 : status === 'running' || status === 'failed' ? 2 : status === 'queued' ? 1 : 0;

  return (
    <main className="dashboard" id="overview">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#overview" aria-label="VEGAH Queue Lab overview">
          <span className="brand-symbol">V<span /></span>
          <span className="brand-copy"><b>VEGAH</b><small>QUEUE LAB</small></span>
        </a>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          <a className="nav-link nav-link-active" href="#overview" aria-label="Overview"><Icon name="grid"/><span>Overview</span><span className="nav-current" /></a>
          <a className="nav-link" href="#new-job" aria-label="New job"><Icon name="plus"/><span>New job</span></a>
          <a className="nav-link" href="#recent-jobs" aria-label="Recent jobs"><Icon name="activity"/><span>Recent jobs</span>{jobs.length > 0 && <span className="nav-count">{jobs.length}</span>}</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-stack-label">PIPELINE</div>
          <div className="sidebar-stack">
            <span className="stack-symbol"><Icon name="layers" size={16}/></span>
            <span><b>Async text metrics</b><small>Redis · BullMQ · PostgreSQL</small></span>
          </div>
          <div className="sidebar-foot"><span className="health-dot"/> DEMO ENVIRONMENT</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>VEGAH</span><b>/</b><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className="environment-pill"><span className="environment-dot"/> LIVE DEMO</span>
            <span className="topbar-divider" />
            <span className="region-label">AWS · US EAST</span>
            <button className="icon-button health-refresh" type="button" aria-label="Refresh system health" onClick={() => void refreshHealth()}><Icon name="refresh" size={17}/></button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-intro">
            <div>
              <div className="overline"><span className="overline-line"/> ASYNC WORKFLOW PLAYGROUND</div>
              <h1>Queue control <span>center</span></h1>
              <p>Submit a task, follow it through the worker, and inspect the result saved in PostgreSQL.</p>
            </div>
            <a className="intro-action" href="#new-job"><Icon name="plus" size={16}/> Run a task</a>
          </section>

          <section className="health-section" aria-label="System health">
            <div className="health-card">
              <span className="health-icon"><Icon name="activity" size={17}/></span>
              <span className="health-copy"><small>API RUNTIME</small><b><HealthBadge state={health.api} label="" /></b></span>
              <span className="health-card-end"><Icon name="arrow" size={14}/></span>
            </div>
            <div className="health-card">
              <span className="health-icon"><Icon name="server" size={17}/></span>
              <span className="health-copy"><small>DATABASE + QUEUE</small><b><HealthBadge state={health.dependencies} label="" /></b></span>
              <span className="health-card-end"><Icon name="arrow" size={14}/></span>
            </div>
            <div className="health-card health-card-summary">
              <span className="health-icon health-icon-teal"><Icon name="layers" size={17}/></span>
              <span className="health-copy"><small>JOBS IN PROGRESS</small><b>{activeJobCount.toString().padStart(2, '0')} <em>active</em></b></span>
              <span className="health-card-end"><Icon name="arrow" size={14}/></span>
            </div>
            <div className="health-updated">CHECKED {health.checkedAt ? formatDate(health.checkedAt) : '—'}</div>
          </section>

          <section className="pipeline-card" aria-label="Job processing pipeline">
            <div className="pipeline-heading"><div><span className="section-kicker">THE PIPELINE</span><h2>One request. Four steps.</h2></div><span className="pipeline-note"><span className="health-dot"/> LIVE SYSTEM</span></div>
            <div className="pipeline-flow">
              <div className="pipeline-node"><span className="pipeline-icon"><Icon name="grid" size={17}/></span><span><b>Web app</b><small>Next.js</small></span></div>
              <span className="pipeline-connector"><i/></span>
              <div className="pipeline-node"><span className="pipeline-icon"><Icon name="activity" size={17}/></span><span><b>API</b><small>NestJS</small></span></div>
              <span className="pipeline-connector"><i/></span>
              <div className="pipeline-node"><span className="pipeline-icon"><Icon name="layers" size={17}/></span><span><b>Queue</b><small>Redis · BullMQ</small></span></div>
              <span className="pipeline-connector"><i/></span>
              <div className="pipeline-node"><span className="pipeline-icon"><Icon name="server" size={17}/></span><span><b>Worker + store</b><small>NestJS · PostgreSQL</small></span></div>
            </div>
          </section>

          <div className="work-grid">
            <section className="surface submit-surface" id="new-job">
              <div className="surface-heading">
                <div className="section-title-wrap"><span className="section-icon"><Icon name="plus" size={17}/></span><div><span className="section-kicker">NEW TASK</span><h2>Send work to the queue</h2></div></div>
                <span className="request-method">POST <i>/api/jobs</i></span>
              </div>
              <p className="surface-description">The worker counts words, sentences, characters, and estimated reading time. No AI service or external key is used.</p>
              <form onSubmit={submit}>
                <label className="input-label" htmlFor="job-text">Task text <span>Required</span></label>
                <textarea id="job-text" className="task-input" value={text} maxLength={MAX_TEXT_LENGTH} onChange={(event) => { setText(event.target.value); if (notice) setNotice(''); }} placeholder="Paste a short operational note to process…" aria-describedby="input-help input-count" />
                <div className="input-meta"><span id="input-help">Use a sample below or enter your own text.</span><span id="input-count">{MAX_TEXT_LENGTH - text.length} characters left</span></div>
                <div className="sample-row" aria-label="Example text">
                  {samples.map((sample) => <button className="sample-chip" type="button" key={sample.label} onClick={() => { setText(sample.text); setNotice(''); }}>{sample.label}</button>)}
                </div>
                {notice && <div className="form-alert" role="alert"><Icon name="alert" size={16}/><span>{notice}</span></div>}
                <button className="submit-button" type="submit" disabled={submitting || !text.trim()}>
                  {submitting ? <><span className="button-spinner"/>Adding to queue…</> : <><span>Queue this task</span><Icon name="arrow" size={17}/></>}
                </button>
                <p className="submit-footnote"><Icon name="check" size={13}/> Your submitted text is processed and stored with this job.</p>
              </form>
            </section>

            <section className="surface job-surface" aria-label="Selected job details">
              <div className="surface-heading">
                <div className="section-title-wrap"><span className="section-icon section-icon-purple"><Icon name="activity" size={17}/></span><div><span className="section-kicker">JOB INSPECTOR</span><h2>{selectedJob ? 'Task details' : 'Ready for a task'}</h2></div></div>
                {selectedJob && <span role="status" aria-live="polite"><StatusBadge status={selectedJob.missing ? 'missing' : selectedJob.status}/></span>}
              </div>
              {selectedJob ? <>
                <div className="job-reference"><div><span className="field-caption">JOB ID</span><code>{selectedJob.id}</code></div><button type="button" className="copy-button" onClick={() => void copyId()} aria-label="Copy job ID"><Icon name={copied ? 'check' : 'copy'} size={15}/>{copied ? 'Copied' : 'Copy'}</button></div>
                <div className="job-meta-row"><span><Icon name="clock" size={14}/> Submitted {formatDate(selectedJob.created_at)}</span><span>{selectedJob.stale ? 'Status temporarily unavailable' : selectedJob.updated_at ? `Updated ${formatDate(selectedJob.updated_at)}` : 'Waiting for worker'}</span></div>
                <div className={`job-progress ${selectedJob.status === 'failed' ? 'job-progress-failed' : ''}`}>
                  {['Queued', 'Processing', 'Saved'].map((step, index) => {
                    const done = index < completedSteps;
                    const failedAt = selectedJob.status === 'failed' && index === 1;
                    return <div className={`progress-step ${done ? 'progress-done' : ''} ${failedAt ? 'progress-failed' : ''}`} key={step}><span className="progress-marker">{failedAt ? <Icon name="alert" size={12}/> : done ? <Icon name="check" size={13}/> : String(index + 1).padStart(2, '0')}</span><b>{failedAt ? 'Failed' : step}</b></div>;
                  })}
                </div>
                {selectedJob.result ? <div className="result-block"><div className="result-heading"><span>PROCESSING RESULT</span><span className="result-saved"><Icon name="check" size={12}/> Saved to PostgreSQL</span></div><div className="metrics-grid"><div className="metric"><strong>{selectedJob.result.words}</strong><span>WORDS</span></div><div className="metric"><strong>{selectedJob.result.sentences}</strong><span>SENTENCES</span></div><div className="metric"><strong>{selectedJob.result.characters}</strong><span>CHARACTERS</span></div><div className="metric"><strong>{displayTime(selectedJob.result.estimatedReadingSeconds)}</strong><span>READ TIME</span></div></div></div>
                  : selectedJob.status === 'failed' ? <div className="job-message job-error"><Icon name="alert" size={17}/><span>{selectedJob.error || 'The worker could not complete this task.'}</span></div>
                  : selectedJob.missing ? <div className="job-message"><Icon name="alert" size={17}/><span>This job is no longer available from the API. It can be removed from this browser’s recent list.</span></div>
                  : selectedJob.stale ? <div className="job-message"><span className="button-spinner"/><span>Could not refresh the status. The last known status is shown; polling will retry.</span></div>
                  : <div className="job-message"><span className="button-spinner"/><span>{selectedJob.status === 'queued' ? 'Waiting for a worker to pick up the task…' : 'The worker is processing your task…'}</span></div>}
                <button type="button" className="refresh-job" onClick={() => void refreshJob(selectedJob.id).then((job) => setJobs((current) => current.map((item) => item.id === selectedJob.id ? ('missing' in job ? { ...item, missing: true, stale: false } : { ...job, stale: false }) : item))).catch(() => setJobs((current) => current.map((item) => item.id === selectedJob.id ? { ...item, stale: true } : item)))}><Icon name="refresh" size={14}/> Refresh job status</button>
              </> : <div className="inspector-empty"><span className="empty-emblem"><Icon name="spark" size={22}/></span><h3>Your job results land here</h3><p>Queue a sample task to see its progress and the metrics returned by the worker.</p><div className="empty-steps"><span><i>01</i> Queue</span><span><i>02</i> Process</span><span><i>03</i> Save</span></div></div>}
            </section>
          </div>

          <section className="surface recent-surface" id="recent-jobs">
            <div className="recent-heading"><div className="section-title-wrap"><span className="section-icon section-icon-amber"><Icon name="clock" size={17}/></span><div><span className="section-kicker">THIS BROWSER</span><h2>Recent jobs <span className="recent-total">{jobs.length.toString().padStart(2, '0')}</span></h2></div></div>
              {jobs.length > 0 && <button className="clear-history" type="button" onClick={clearHistory}><Icon name="trash" size={14}/> Clear local history</button>}
            </div>
            {jobs.length ? <div className="recent-list" role="list" aria-label="Recent jobs">
              {jobs.map((job) => <button className={`recent-row ${job.id === selectedId ? 'recent-row-selected' : ''}`} type="button" role="listitem" key={job.id} onClick={() => setSelectedId(job.id)} aria-current={job.id === selectedId ? 'true' : undefined}>
                <span className="recent-job-icon"><Icon name={job.status === 'completed' ? 'check' : job.status === 'failed' ? 'alert' : 'activity'} size={15}/></span>
                <span className="recent-job-main"><b>{job.missing ? 'Job unavailable' : `Job ${job.id.slice(0, 8)}`}</b><small>{formatDate(job.created_at)}{job.stale ? ' · status may be out of date' : ''}</small></span>
                <StatusBadge status={job.missing ? 'missing' : job.status}/>
                <Icon name="arrow" size={15}/>
              </button>)}
            </div> : <div className="recent-empty"><span className="recent-empty-icon"><Icon name="activity" size={18}/></span><span><b>No recent jobs in this browser</b><small>Submitted job IDs will appear here. Task text is never saved in browser history.</small></span></div>}
            <div className="recent-note"><Icon name="alert" size={13}/> Local history stores job IDs only. Clearing it does not delete jobs from the server.</div>
          </section>

          <footer className="footer"><span>VEGAH QUEUE LAB <i>·</i> ASYNC TEXT METRICS DEMO</span><span>API + WORKER + PERSISTENT RESULTS</span></footer>
        </div>
      </div>
    </main>
  );
}
