import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
