'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Job = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: { characters: number; words: number; sentences: number; estimatedReadingSeconds: number };
  error?: string;
  created_at?: string;
};

const examples = [
  'Analyze delivery notes and return a concise operational summary.',
  'Check an incoming support request and estimate its reading time.',
  'Process a supplier update asynchronously and report its text metrics.',
];

export default function Home() {
  const [text, setText] = useState('VEGAH turns operational work into reliable cloud workflows.');
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function refresh(id: string) {
    try {
      const response = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not read job status');
      const next: Job = await response.json();
      setJob(next);
      if (next.status === 'completed' || next.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      setNotice('Status check failed. The job may still be processing; try refresh in a moment.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setNotice('');
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error('The API could not queue this job. Please check that the services are healthy.');
      const created = await response.json() as { id: string; status: Job['status'] };
      setJob(created);
      pollRef.current = setInterval(() => void refresh(created.id), 1000);
      void refresh(created.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Something went wrong while submitting the job.');
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = job?.status ?? 'ready';

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="VEGAH Queue Lab home">
          <span className="brand-mark">V</span><span>VEGAH<span className="brand-light"> / Queue Lab</span></span>
        </a>
        <div className="topbar-right"><span className="live-dot" /> DEMO ENVIRONMENT <span className="divider" /> CLOUD SYSTEMS</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span> ASYNC WORKFLOW PLAYGROUND</div>
          <h1>Work moves.<br /><em>Systems keep up.</em></h1>
          <p>Send a task through the stack and watch it travel from the API into a Redis queue, through a worker, and back as a durable result.</p>
          <div className="stack-list"><span>Next.js</span><i /> <span>NestJS</span><i /> <span>BullMQ</span><i /> <span>PostgreSQL</span></div>
        </div>
        <div className="hero-aside">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="node node-web"><span>WEB</span><b>01</b></div>
          <div className="node node-api"><span>API</span><b>02</b></div>
          <div className="node node-queue"><span>QUEUE</span><b>03</b></div>
          <div className="node node-worker"><span>WORKER</span><b>04</b></div>
          <div className="orbit-core"><span>JOB</span><strong>↗</strong></div>
          <span className="orbit-label label-a">REQUEST</span><span className="orbit-label label-b">RESULT</span>
        </div>
      </section>

      <section className="workspace" aria-label="Async job demo">
        <div className="section-heading"><div><div className="eyebrow"><span>02</span> LIVE JOB RUN</div><h2>Put a task in motion</h2></div><div className="system-state"><span className="live-dot" /> QUEUE ONLINE</div></div>
        <div className="panel-grid">
          <form className="panel submit-panel" onSubmit={submit}>
            <div className="panel-top"><span className="panel-index">A</span><div><h3>Submit payload</h3><p>Up to 4,000 characters</p></div></div>
            <label className="sr-only" htmlFor="task-input">Text to process</label>
            <textarea id="task-input" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Write a short note for the worker to analyze…" />
            <div className="field-foot"><span>{text.length} / 4,000</span><button className="text-button" type="button" onClick={() => setText(examples[Math.floor(Math.random() * examples.length)])}>TRY AN EXAMPLE ↗</button></div>
            <button className="submit-button" type="submit" disabled={submitting || !text.trim()}><span>{submitting ? 'QUEUEING TASK…' : 'QUEUE TASK'}</span><span className="arrow">↗</span></button>
            {notice && <p className="notice" role="alert">{notice}</p>}
          </form>

          <section className="panel status-panel" aria-live="polite">
            <div className="panel-top"><span className="panel-index">B</span><div><h3>Processing status</h3><p>Backend → Redis → worker → database</p></div><span className={`status-chip status-${statusLabel}`}>{statusLabel.toUpperCase()}</span></div>
            {job ? <>
              <div className="job-id"><span>JOB ID</span><code>{job.id}</code></div>
              <div className="status-track"><div className={`track-step ${['queued','running','completed'].includes(job.status) ? 'done' : ''}`}><span>01</span><b>QUEUED</b></div><div className={`track-step ${['running','completed'].includes(job.status) ? 'done' : ''}`}><span>02</span><b>PROCESSING</b></div><div className={`track-step ${job.status === 'completed' ? 'done' : ''}`}><span>03</span><b>COMPLETE</b></div></div>
              {job.result ? <div className="result-grid"><div><strong>{job.result.words}</strong><span>WORDS</span></div><div><strong>{job.result.sentences}</strong><span>SENTENCES</span></div><div><strong>{job.result.characters}</strong><span>CHARACTERS</span></div><div><strong>{job.result.estimatedReadingSeconds}s</strong><span>READ TIME</span></div></div> : job.status === 'failed' ? <p className="notice">{job.error || 'The worker could not process this task.'}</p> : <div className="waiting"><span className="pulse" /> Worker is processing your task<span className="ellipsis">···</span></div>}
            </> : <div className="empty-state"><div className="empty-icon">↗</div><p>Your next task is one click away.</p><span>Submit a payload to start the queue.</span></div>}
            <div className="panel-bottom"><span><i className="mini-dot" /> DURABLE RESULT STORE</span><span>POSTGRESQL</span></div>
          </section>
        </div>
      </section>

      <footer className="footer"><span>BUILT TO SHOW THE PATH FROM REQUEST TO RESULT.</span><span>VEGAH <b>•</b> DEVOPS / MLOPS DEMO</span></footer>
    </main>
  );
}
