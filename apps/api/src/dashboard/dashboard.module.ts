import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { ControlDatabaseModule } from '../database/control-database.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({ imports: [TenantModule, ControlDatabaseModule, BillingModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
