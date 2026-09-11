import { Module } from '@nestjs/common';
import { TenantConnectionInterceptor } from './tenant-connection.interceptor.js';
import { TenantConnectionManager } from './tenant-connection-manager.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { TenantMembershipGuard } from './tenant-membership.guard.js';
import { TenantResolverService } from './tenant-resolver.service.js';

@Module({
  providers: [
    TenantResolverService,
    TenantConnectionManager,
    TenantContextService,
    TenantMembershipGuard,
    TenantConnectionInterceptor,
  ],
  exports: [TenantContextService, TenantMembershipGuard, TenantConnectionInterceptor],
})
export class TenantModule {}
