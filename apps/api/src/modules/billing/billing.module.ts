import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { AdminBillingController, RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';

@Module({ controllers: [BillingController, RefundsController, AdminBillingController], providers: [BillingService, RefundsService] })
export class BillingModule {}
