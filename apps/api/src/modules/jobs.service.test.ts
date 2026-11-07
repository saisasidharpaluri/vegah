import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';

test('creates a durable queued job before publishing it to Redis', async () => {
  const calls: unknown[][] = [];
  const db = { query: async (...args: unknown[]) => { calls.push(args); return { rows: [] }; }, end: async () => undefined };
  const queue = { add: async (...args: unknown[]) => { calls.push(args); } };
  const redis = { quit: async () => 'OK' };
  const service = new JobsService(db as never, queue as never, redis as never);

  const result = await service.create('inspect this text');
  assert.equal(result.status, 'queued');
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(calls.length, 2);
  assert.match(String(calls[0][0]), /INSERT INTO jobs/);
  assert.equal(calls[1][0] as string, 'analyze-text');
  assert.deepEqual(calls[1][1], { id: result.id, text: 'inspect this text' });
});

test('marks the row failed when Redis cannot accept the job', async () => {
  const calls: unknown[][] = [];
  const db = { query: async (...args: unknown[]) => { calls.push(args); return { rows: [] }; }, end: async () => undefined };
  const queue = { add: async () => { throw new Error('Redis offline'); } };
  const redis = { quit: async () => 'OK' };
  const service = new JobsService(db as never, queue as never, redis as never);

  await assert.rejects(() => service.create('text'), { message: 'The job queue is temporarily unavailable' });
  assert.equal(calls.length, 2);
  assert.match(String(calls[1][0]), /status = 'failed'/);
});

test('returns stored job state and reports unknown job IDs', async () => {
  const row = { id: 'id', status: 'completed', result: { words: 2 } };
  const db = { query: async () => ({ rows: [row] }), end: async () => undefined };
  const service = new JobsService(db as never, {} as never, {} as never);
  assert.equal(await service.get('id'), row);

  const missing = new JobsService({ query: async () => ({ rows: [] }) } as never, {} as never, {} as never);
  await assert.rejects(() => missing.get('missing'), NotFoundException);
});
