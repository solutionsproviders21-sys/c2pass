import { Module } from '@nestjs/common';
import { AdminBetaController } from './beta.controller.js';
import { BetaService } from './beta.service.js';

@Module({ controllers: [AdminBetaController], providers: [BetaService] })
export class BetaModule {}
