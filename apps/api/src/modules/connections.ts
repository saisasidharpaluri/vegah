import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';

export const DB = 'DATABASE_POOL';
export const REDIS = 'REDIS_CONNECTION';
export const QUEUE = 'ANALYSIS_QUEUE';

export function createPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
}

export function createRedis(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

export function createQueue(redis: Redis): Queue {
  return new Queue('analysis', { connection: redis });
}
