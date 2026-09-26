import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [TenantModule, AuditModule, CommunicationModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
