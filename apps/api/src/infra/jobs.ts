import { Logger } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export type JobHandler = (data: any) => Promise<void>;

/**
 * Background jobs. With Redis: BullMQ queues and workers (retries with backoff, repeatable watcher job).
 * Without Redis (dev, tests): handlers run inline and are awaited, which keeps tests deterministic.
 */
export interface Jobs {
  register(name: string, handler: JobHandler): void;
  enqueue(name: string, data: unknown, opts?: { priority?: number }): Promise<void>;
  repeat(name: string, everyMs: number): Promise<void>;
  close(): Promise<void>;
}

export class InlineJobs implements Jobs {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly logger = new Logger('Jobs');

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  async enqueue(name: string, data: unknown) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for job ${name}`);
    await handler(data);
  }

  async repeat(name: string, everyMs: number) {
    this.timers.push(
      setInterval(() => {
        this.enqueue(name, {}).catch((e) => this.logger.error(`${name}: ${e instanceof Error ? e.message : e}`));
      }, everyMs).unref(),
    );
  }

  async close() {
    this.timers.forEach(clearInterval);
  }
}

const QUEUE = 'c2pass';

export class BullJobs implements Jobs {
  private readonly queue: Queue;
  private readonly handlers = new Map<string, JobHandler>();
  private worker: Worker | null = null;
  private readonly connection: ConnectionOptions;

  constructor(redisUrl: string, private readonly runWorker: boolean) {
    const u = new URL(redisUrl);
    this.connection = { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE, { connection: this.connection });
  }

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
    if (this.runWorker && !this.worker) {
      this.worker = new Worker(
        QUEUE,
        async (job) => {
          const h = this.handlers.get(job.name);
          if (!h) throw new Error(`No handler for job ${job.name}`);
          await h(job.data);
        },
        { connection: this.connection, concurrency: 5 },
      );
    }
  }

  async enqueue(name: string, data: unknown, opts?: { priority?: number }) {
    await this.queue.add(name, data, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
      priority: opts?.priority,
    });
  }

  async repeat(name: string, everyMs: number) {
    await this.queue.upsertJobScheduler(`repeat:${name}`, { every: everyMs }, { name, data: {} });
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
  }
}

export const JOBS = Symbol('JOBS');
