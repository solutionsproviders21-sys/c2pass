import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { type Express, type Request } from 'express';
import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import helmet from 'helmet';
import { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Config } from './config.js';

/** HTTP hardening shared by the server and the integration tests. */
export function configureApp(app: INestApplication, config: Config) {
  app.setGlobalPrefix('api');
  const server = app.getHttpAdapter().getInstance() as Express;
  // Number of reverse proxies in front of the API (the Caddy container in docker compose): the client IP is read
  // from X-Forwarded-For only through those, so it cannot be spoofed to dodge the rate limits.
  server.set('trust proxy', config.TRUST_PROXY);
  server.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  if (config.NODE_ENV === 'test' && !config.RATE_LIMIT_IN_TESTS) return;

  // With Redis the counters are shared by every API instance; without it they live in this process only.
  const redis = config.REDIS_URL ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: true }) : null;
  if (redis) {
    const close = app.close.bind(app);
    app.close = async () => {
      await close();
      redis.disconnect();
    };
  }
  const store = (name: string): Store | undefined => redis
    ? new RedisStore({ prefix: `rl:${name}:`, sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply> })
    : undefined;
  const limit = (name: string, windowMinutes: number, max: number, extra: Parameters<typeof rateLimit>[0] = {}) => rateLimit({
    windowMs: windowMinutes * 60_000, limit: max, standardHeaders: 'draft-8', legacyHeaders: false, store: store(name),
    message: { error: { code: 'too_many_requests', message: 'Trop de tentatives. Réessayez dans quelques minutes.' } },
    ...extra,
  });

  app.use(['/api/auth/login', '/api/auth/register', '/api/auth/totp', '/api/auth/password', '/api/auth/oauth/exchange', '/api/auth/email'], limit('auth', 15, 30));
  // Password guessing spread over many IPs: failed logins are also counted per account.
  app.use('/api/auth/login', express.json({ limit: '10kb' }), limit('login-account', 15, 10, {
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
      return email ? `email:${email}` : ipKeyGenerator(req.ip ?? '');
    },
  }));
  app.use('/api/auth/refresh', limit('refresh', 15, 120));
  app.use('/api/payments/checkout', limit('checkout', 60, 20));
  app.use('/api/leads', limit('leads', 60, 20));
}
