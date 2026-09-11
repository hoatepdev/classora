import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard.js';
import { TenantContextService } from './tenant/tenant-context.service.js';
import { TenantRoute } from './tenant/tenant-route.js';

@Controller('health')
export class HealthController {
  constructor(private readonly tenantContext: TenantContextService) {}

  @Public()
  @Get()
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @TenantRoute()
  @Get('tenant')
  getTenant() {
    const { tenantId, tenantSlug } = this.tenantContext.get().tenant;
    return { tenantId, tenantSlug };
  }

  @TenantRoute()
  @Get('tenant/query')
  async queryTenant() {
    const context = this.tenantContext.get();
    const { rows } = await context.pool.query<{ result: number }>('SELECT 1 AS result');
    return {
      tenantId: context.tenant.tenantId,
      tenantSlug: context.tenant.tenantSlug,
      result: rows[0].result,
    };
  }
}
