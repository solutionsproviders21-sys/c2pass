import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { MongoClient, type Db } from 'mongodb';
import type pg from 'pg';
import { CONFIG, loadConfig, type Config } from '../config.js';
import { Cipher } from './crypto.js';
import { createPool } from './database.js';
import { BullJobs, InlineJobs, JOBS, type Jobs } from './jobs.js';
import { ConsoleNotifier, LiveNotifier, NOTIFIER } from './notifier.js';
import { LocalStorage, S3Storage, STORAGE } from './storage.js';
import { MONGO, PG } from './tokens.js';

const mongoClients = new WeakMap<Db, MongoClient>();

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: PG, inject: [CONFIG], useFactory: (c: Config) => createPool(c.DATABASE_URL) },
    {
      provide: MONGO,
      inject: [CONFIG],
      useFactory: async (c: Config) => {
        const client = await new MongoClient(c.MONGO_URL, { serverSelectionTimeoutMS: 5_000 }).connect();
        const db = client.db(c.MONGO_DB);
        mongoClients.set(db, client);
        return db;
      },
    },
    { provide: Cipher, inject: [CONFIG], useFactory: (c: Config) => new Cipher(c.VAULT_KEY, c.VAULT_KEY_ID) },
    { provide: NOTIFIER, inject: [CONFIG], useFactory: (c: Config) => (c.NOTIFICATIONS_MODE === 'live' ? new LiveNotifier(c) : new ConsoleNotifier()) },
    { provide: STORAGE, inject: [CONFIG], useFactory: (c: Config) => (c.S3_BUCKET
      ? new S3Storage(c.S3_BUCKET, { endpoint: c.S3_ENDPOINT, region: c.S3_REGION, accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY })
      : new LocalStorage(c.STORAGE_DIR)) },
    {
      provide: JOBS,
      inject: [CONFIG],
      useFactory: (c: Config): Jobs => (c.REDIS_URL ? new BullJobs(c.REDIS_URL, process.env.WORKERS !== 'off') : new InlineJobs()),
    },
  ],
  exports: [CONFIG, PG, MONGO, Cipher, NOTIFIER, STORAGE, JOBS],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(MONGO) private readonly mongo: Db,
    @Inject(JOBS) private readonly jobs: Jobs,
  ) {}

  async onApplicationShutdown() {
    await this.jobs.close();
    await this.pool.end();
    await mongoClients.get(this.mongo)?.close();
  }
}
