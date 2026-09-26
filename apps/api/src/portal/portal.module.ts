import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { PortalAccessAdminController, PortalInvitationController } from './portal-access.controller.js';
import { PortalAccessGuard } from './portal-access.guard.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [AuditModule, TenantModule],
  controllers: [PortalAccessAdminController, PortalInvitationController, PortalController],
  providers: [PortalAccessGuard, PortalAccessService, PortalService],
  exports: [PortalAccessGuard],
})
export class PortalModule {}
