import { Module } from '@nestjs/common';
import { ControlDatabaseModule } from '../database/control-database.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({ imports: [ControlDatabaseModule, TenantModule], controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
