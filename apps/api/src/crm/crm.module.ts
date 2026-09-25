import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ControlDatabaseModule } from '../database/control-database.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { StudentsModule } from '../students/students.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { CrmConversionService } from './crm-conversion.service.js';
import { CrmTrialsService } from './crm-trials.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({
  imports: [TenantModule, AuditModule, ControlDatabaseModule, StudentsModule, EnrollmentsModule],
  controllers: [CrmController],
  providers: [CrmService, CrmTrialsService, CrmConversionService],
})
export class CrmModule {}
