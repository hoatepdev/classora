import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/auth.guard.js';
import { TenantContextService } from './tenant/tenant-context.service.js';
import { errorResponse, schemaRef } from './openapi.js';
import { TenantRoute } from './tenant/tenant-route.js';
import { ControlDatabaseService } from './database/control-database.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly controlDatabase: ControlDatabaseService,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({ schema: schemaRef('Health') })
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('live')
  @ApiOkResponse({ schema: schemaRef('Health') })
  getLive() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ schema: schemaRef('Readiness') })
  @ApiResponse({ status: 503, description: 'Control database unavailable', ...errorResponse })
  async getReadiness() {
    try {
      await this.controlDatabase.$queryRaw`SELECT 1`;
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Control database unavailable');
    }
  }

  @TenantRoute()
  @Get('tenant')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: schemaRef('TenantHealth') })
  @ApiResponse({ status: 401, description: 'Not authenticated', ...errorResponse })
  @ApiResponse({ status: 403, description: 'Tenant membership required', ...errorResponse })
  @ApiResponse({ status: 404, description: 'Tenant not found', ...errorResponse })
  getTenant() {
    const { tenantId, tenantSlug } = this.tenantContext.get().tenant;
    return { tenantId, tenantSlug };
  }

  @TenantRoute()
  @Get('tenant/query')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: schemaRef('TenantQueryHealth') })
  @ApiResponse({ status: 401, description: 'Not authenticated', ...errorResponse })
  @ApiResponse({ status: 403, description: 'Tenant membership required', ...errorResponse })
  @ApiResponse({ status: 404, description: 'Tenant not found', ...errorResponse })
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
