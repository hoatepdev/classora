import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}
