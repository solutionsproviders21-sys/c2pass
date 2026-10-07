import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { AppModule } from './app.module.js';
import { CONFIG, type Config } from './config.js';
import { migrate } from './db/migrate.js';
import { PG } from './infra/tokens.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  // rawBody: Stripe webhook signatures are computed on the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: true });
  const config = app.get<Config>(CONFIG);
  app.useBodyParser('json', { limit: '1mb' });
  configureApp(app, config);
  const applied = await migrate(app.get<pg.Pool>(PG));
  if (applied.length) Logger.log(`Migrations applied: ${applied.join(', ')}`, 'Database');
  app.enableShutdownHooks();
  await app.listen(config.PORT);
  Logger.log(`C2Pass API on http://localhost:${config.PORT}/api`, 'Bootstrap');
}

void bootstrap();
