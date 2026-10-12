import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config.js';

/** HTTP hardening shared by the server and the integration tests. */
export function configureApp(app: INestApplication, config: Config) {
  app.setGlobalPrefix('api');
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  if (config.NODE_ENV !== 'test') {
    // In-memory counters: per API process. With several instances behind a load balancer, use a shared (Redis) store.
    const limit = (windowMinutes: number, max: number) => rateLimit({ windowMs: windowMinutes * 60_000, limit: max, standardHeaders: 'draft-8', legacyHeaders: false });
    app.use(['/api/auth/login', '/api/auth/register', '/api/auth/totp', '/api/auth/password', '/api/auth/oauth/exchange'], limit(15, 30));
    app.use('/api/auth/refresh', limit(15, 120));
    app.use('/api/payments/checkout', limit(60, 20));
    app.use('/api/leads', rateLimit({ windowMs: 60 * 60_000, limit: 20 }));
  }
}
