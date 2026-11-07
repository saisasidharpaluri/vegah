import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { DB, REDIS } from './connections';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Pool, @Inject(REDIS) private readonly redis: Redis) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    await Promise.all([this.db.query('SELECT 1'), this.redis.ping()]);
    return { status: 'ready' };
  }
}
