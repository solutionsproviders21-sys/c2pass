import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { HealthController } from './health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { AccountModule } from './modules/account/account.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BetaModule } from './modules/beta/beta.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CentresModule } from './modules/centres/centres.module.js';
import { ContentModule } from './modules/content/content.module.js';
import { EvaluationModule } from './modules/evaluation/evaluation.module.js';
import { SimulatorModule } from './modules/simulator/simulator.module.js';
import { TrainingModule } from './modules/training/training.module.js';

@Module({
  imports: [
    InfraModule, ContentModule, EvaluationModule,
    AuthModule, AccountModule, TrainingModule, SimulatorModule, CentresModule, BillingModule, AdminModule, BetaModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
