import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { analyzeText } from './analyze';

const connection = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });

const worker = new Worker(
  'analysis',
  async (job) => {
    const { id, text } = job.data as { id: string; text: string };
    await db.query("UPDATE jobs SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    const result = analyzeText(text);
    await db.query("UPDATE jobs SET status = 'completed', result = $2, updated_at = NOW() WHERE id = $1", [id, result]);
    return result;
  },
  { connection, concurrency: 4 },
);

worker.on('failed', (job, error) => {
  if (!job) return;
  const terminal = job.attemptsMade >= Number(job.opts.attempts ?? 1);
  if (terminal) {
    void db.query("UPDATE jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1", [job.data.id, error.message.slice(0, 500)])
      .catch((dbError: unknown) => console.error('Could not record terminal job failure', dbError));
  }
  console.error(`Job ${job.id} failed (attempt ${job.attemptsMade})`, error);
});

worker.on('error', (error) => console.error('Worker error', error));

async function shutdown(): Promise<void> {
  await worker.close();
  await Promise.all([connection.quit(), db.end()]);
}

process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
