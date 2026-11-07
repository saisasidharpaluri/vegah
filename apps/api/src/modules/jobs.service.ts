import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { DB, QUEUE } from './connections';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DB) private readonly db: Pool,
    @Inject(QUEUE) private readonly queue: Queue,
    @Inject('REDIS_CONNECTION') private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY,
        input_text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await Promise.all([this.redis.quit(), this.db.end()]);
  }

  async create(text: string) {
    const id = randomUUID();
    await this.db.query('INSERT INTO jobs (id, input_text, status) VALUES ($1, $2, $3)', [id, text, 'queued']);
    try {
      await this.queue.add('analyze-text', { id, text }, { jobId: id, attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 200, removeOnFail: 500 });
    } catch (error) {
      await this.db.query("UPDATE jobs SET status = 'failed', error = 'Queue unavailable', updated_at = NOW() WHERE id = $1", [id]);
      console.error('Failed to enqueue job', error);
      throw new ServiceUnavailableException('The job queue is temporarily unavailable');
    }
    return { id, status: 'queued' as const };
  }

  async get(id: string) {
    const { rows } = await this.db.query(
      'SELECT id, status, result, error, created_at, updated_at FROM jobs WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Job not found');
    return rows[0];
  }
}
