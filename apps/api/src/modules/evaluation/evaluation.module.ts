import { Global, Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service.js';

@Global()
@Module({ providers: [EvaluationService], exports: [EvaluationService] })
export class EvaluationModule {}
