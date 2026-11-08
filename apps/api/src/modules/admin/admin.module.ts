import { Module } from '@nestjs/common';
import { SimulatorModule } from '../simulator/simulator.module.js';
import { AdminController, LeadsController, ReviewsController } from './admin.controller.js';
import { GdprRegisterController } from './gdpr-register.js';
import { MarketingController } from './marketing.controller.js';

@Module({ imports: [SimulatorModule], controllers: [AdminController, ReviewsController, LeadsController, GdprRegisterController, MarketingController] })
export class AdminModule {}
