import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Db } from 'mongodb';
import type pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { signAccessToken } from '../src/common/auth.js';
import { CONFIG, type Config } from '../src/config.js';
import { seed } from '../src/db/seed.js';
import webpush from 'web-push';
import { MemoryNotifier, NOTIFIER } from '../src/infra/notifier.js';
import { PUSH, PushService, type PushTransport } from '../src/infra/push.js';
import { MONGO, PG } from '../src/infra/tokens.js';
import { TEST_DATABASE_URL, TEST_MONGO_DB, TEST_MONGO_URL } from './global-setup.js';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  MONGO_URL: TEST_MONGO_URL,
  MONGO_DB: TEST_MONGO_DB,
  REDIS_URL: '',
  STORAGE_DIR: './storage-test',
  LANGUAGETOOL_URL: '',
  OPENAI_API_KEY: '',
  PAYMENTS_MODE: 'sandbox',
  PAYMENTS_WEBHOOK_SECRET: 'test-webhook-secret',
});

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  pool: pg.Pool;
  mongo: Db;
  notifier: MemoryNotifier;
  config: Config;
  /** Web Push requests the API would have sent, and the status the fake push service answers per endpoint. */
  pushed: Parameters<PushTransport>[0][];
  pushStatus: Map<string, number>;
}

let seeded = false;

export async function createTestApp(): Promise<TestContext> {
  const notifier = new MemoryNotifier();
  const pushed: TestContext['pushed'] = [];
  const pushStatus = new Map<string, number>();
  const vapid = webpush.generateVAPIDKeys();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(NOTIFIER).useValue(notifier)
    .overrideProvider(PUSH).useFactory({
      inject: [PG, CONFIG],
      factory: (pool: pg.Pool, c: Config) =>
        new PushService(pool, { ...c, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey }, async (req) => {
          pushed.push(req);
          return pushStatus.get(req.endpoint) ?? 201;
        }),
    })
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  const config = app.get<Config>(CONFIG);
  const { configureApp } = await import('../src/setup.js');
  configureApp(app, config);
  await app.init();
  const pool = app.get<pg.Pool>(PG);
  const mongo = app.get<Db>(MONGO);
  if (!seeded) {
    await seed(pool, mongo);
    seeded = true;
  }
  return { app, http: request(app.getHttpServer()), pool, mongo, notifier, config, pushed, pushStatus };
}

let counter = 0;

/** Registers a fresh student and returns an authorised agent. */
export async function newStudent(ctx: TestContext, extra: Record<string, unknown> = {}, { verified = true } = {}) {
  counter += 1;
  const email = `candidat${Date.now()}${counter}@test.cm`;
  const res = await ctx.http.post('/api/auth/register').send({
    email, password: 'MotDePasse123', firstName: 'Awa', lastName: 'Test', country: 'CM', city: 'Douala',
    phone: '+237 690 11 22 33', acceptTerms: true, ...extra,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const { rows: [u] } = await ctx.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (verified) await ctx.pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [u.id]);
  return { email, id: u.id, token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function setPlan(ctx: TestContext, userId: string, plan: string) {
  await ctx.pool.query(`UPDATE users SET plan_id = $2, plan_expires_at = now() + interval '30 days' WHERE id = $1`, [userId, plan]);
}

/** Admin token without going through TOTP (the TOTP flow has its own test). */
export async function adminToken(ctx: TestContext) {
  const { rows: [u] } = await ctx.pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'admin@c2pass.cm'`);
  return signAccessToken(ctx.config.JWT_SECRET, { sub: u.id, role: 'admin' });
}

export async function teacherToken(ctx: TestContext) {
  const { rows: [u] } = await ctx.pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'correcteur@c2pass.cm'`);
  return signAccessToken(ctx.config.JWT_SECRET, { sub: u.id, role: 'teacher' });
}
