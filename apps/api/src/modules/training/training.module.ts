import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller.js';

@Module({ controllers: [TrainingController] })
export class TrainingModule {}
