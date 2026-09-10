import { Controller, Get, Req } from '@nestjs/common';
import type { TenantRequest } from './tenant/tenant-resolver.middleware.js';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('tenant')
  getTenant(@Req() request: TenantRequest) {
    return request.tenant ?? { tenant: null };
  }
}
