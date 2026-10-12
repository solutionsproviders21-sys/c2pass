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
    app.use(['/api/auth/login', '/api/auth/register', '/api/auth/totp', '/api/auth/password/forgot', '/api/auth/password/reset'], rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
    app.use('/api/leads', rateLimit({ windowMs: 60 * 60_000, limit: 20 }));
  }
}
