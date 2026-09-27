import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';
import { ApiTenantDomain, ApiTenantErrors, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { DashboardService } from './dashboard.service.js';

@ApiTenantDomain('Dashboard')
@ApiTenantErrors()
@TenantRoute()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOkResponse({ schema: schemaRef('Dashboard') })
  snapshot(@Req() request: TenantRequest) {
    return this.dashboard.snapshot(request.membership?.permissions ?? []);
  }
}
