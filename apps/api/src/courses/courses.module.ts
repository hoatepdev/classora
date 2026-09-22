import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
