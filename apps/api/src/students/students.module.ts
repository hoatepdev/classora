import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsRelationshipsController } from './students-relationships.controller.js';
import { StudentRelationshipsService } from './relationships.service.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [StudentsController, StudentsRelationshipsController],
  providers: [StudentsService, StudentRelationshipsService],
  exports: [StudentsService, StudentRelationshipsService],
})
export class StudentsModule {}
