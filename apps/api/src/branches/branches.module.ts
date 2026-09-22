import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { BranchesController } from './branches.controller.js';
import { BranchesService } from './branches.service.js';

@Module({ imports: [AuditModule, TenantModule], controllers: [BranchesController], providers: [BranchesService] })
export class BranchesModule {}
