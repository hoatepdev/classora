import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
@Module({imports:[TenantModule,AuditModule],controllers:[ProgressController],providers:[ProgressService],exports:[ProgressService]})
export class ProgressModule {}
