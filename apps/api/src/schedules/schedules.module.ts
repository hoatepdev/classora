import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  imports: [TenantModule, AuditModule, CommunicationModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
