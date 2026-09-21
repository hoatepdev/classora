import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit')
@ApiBearerAuth()
@TenantRoute()
@RequirePermissions(PERMISSIONS.AUDIT_READ)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService, private readonly tenantContext: TenantContextService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    const { tenant } = this.tenantContext.get();
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('Invalid audit date range');
    }
    return this.audit.list({
      tenantId: tenant.tenantId,
      actorUserId: query.actorUserId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from,
      to,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.audit.get(id);
  }
}
