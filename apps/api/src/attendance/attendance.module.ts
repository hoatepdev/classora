import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [TenantModule, AuditModule, CommunicationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
