import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
