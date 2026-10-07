import { Module } from '@nestjs/common';
import { SimulatorModule } from '../simulator/simulator.module.js';
import { AdminController, LeadsController, ReviewsController } from './admin.controller.js';

@Module({ imports: [SimulatorModule], controllers: [AdminController, ReviewsController, LeadsController] })
export class AdminModule {}
