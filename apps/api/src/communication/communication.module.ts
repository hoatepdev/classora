import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { CommunicationController } from './communication.controller.js';
import { CommunicationService } from './communication.service.js';

@Module({
  imports: [TenantModule, AuditModule],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
