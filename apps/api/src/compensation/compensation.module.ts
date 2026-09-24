import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { CompensationController } from './compensation.controller.js';
import { CompensationService } from './compensation.service.js';

@Module({ imports: [TenantModule, AuditModule], controllers: [CompensationController], providers: [CompensationService] })
export class CompensationModule {}
