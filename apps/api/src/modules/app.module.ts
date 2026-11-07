import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { QUEUE, createQueue, createRedis, createPool, DB, REDIS } from './connections';

@Module({
  controllers: [HealthController, JobsController],
  providers: [
    { provide: DB, useFactory: createPool },
    { provide: REDIS, useFactory: createRedis },
    { provide: QUEUE, inject: [REDIS], useFactory: createQueue },
    JobsService,
  ],
})
export class AppModule {}
