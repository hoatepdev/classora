import { Controller, Get } from '@nestjs/common';
import { TenantContextService } from './tenant/tenant-context.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly tenantContext: TenantContextService) {}

  @Get()
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('tenant')
  getTenant() {
    return this.tenantContext.get()?.tenant ?? { tenant: null };
  }

  @Get('tenant/query')
  async queryTenant() {
    const context = this.tenantContext.get();
    if (!context) return { tenant: null };

    const { rows } = await context.pool.query<{ result: number }>('SELECT 1 AS result');
    return { ...context.tenant, result: rows[0].result };
  }
}
