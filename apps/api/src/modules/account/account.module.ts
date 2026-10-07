import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { DashboardController } from './dashboard.controller.js';

@Module({ controllers: [AccountController, DashboardController] })
export class AccountModule {}
