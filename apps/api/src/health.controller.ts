import { Controller, Get, Inject } from '@nestjs/common';
import type { Db } from 'mongodb';
import type pg from 'pg';
import { Public } from './common/auth.js';
import { MONGO, PG } from './infra/tokens.js';
import { EvaluationService } from './modules/evaluation/evaluation.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(MONGO) private readonly mongo: Db,
    @Inject(EvaluationService) private readonly evaluation: EvaluationService,
  ) {}

  @Public()
  @Get()
  async health() {
    await this.pool.query('SELECT 1');
    await this.mongo.command({ ping: 1 });
    return { status: 'ok', ai: this.evaluation.capabilities };
  }
}
