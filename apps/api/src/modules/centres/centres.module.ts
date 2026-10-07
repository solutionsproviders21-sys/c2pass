import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { AlertsController, CentresController } from './centres.controller.js';
import { CentresService } from './centres.service.js';
import { WatcherService } from './watcher.service.js';

@Module({
  controllers: [CentresController, AlertsController],
  providers: [CentresService, AlertsService, WatcherService],
  exports: [CentresService, WatcherService],
})
export class CentresModule {}
