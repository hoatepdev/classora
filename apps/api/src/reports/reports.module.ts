import { Module } from '@nestjs/common';
import { ControlDatabaseModule } from '../database/control-database.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [TenantModule, ControlDatabaseModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
