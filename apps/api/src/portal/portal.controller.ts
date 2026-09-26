import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { schemaRef } from '../openapi.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.guard.js';
import { PortalTenantRoute } from '../tenant/tenant-route.js';
import { PortalPageQueryDto, PortalScheduleQueryDto } from './dto/portal.dto.js';
import { PortalService } from './portal.service.js';

@ApiTags('Portal')
@ApiBearerAuth()
@PortalTenantRoute()
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  @ApiOkResponse({ schema: schemaRef('PortalIdentity') })
  me(@CurrentUser() user: AuthenticatedUser) { return this.portal.me(user); }

  @Get('students/:id')
  student(@Param('id') id: string) { return this.portal.student(id); }

  @Get('students/:id/schedule')
  schedule(@Param('id') id: string, @Query() query: PortalScheduleQueryDto) { return this.portal.schedule(id, query.from, query.to); }

  @Get('students/:id/attendance')
  attendance(@Param('id') id: string, @Query() query: PortalPageQueryDto) { return this.portal.attendance(id, query); }

  @Get('students/:id/makeup')
  makeup(@Param('id') id: string) { return this.portal.makeup(id); }

  @Get('students/:id/billing')
  billing(@Param('id') id: string) { return this.portal.billing(id); }

  @Get('notifications')
  @ApiOkResponse({ schema: schemaRef('PortalNotifications') })
  notifications(@Query() query: PortalPageQueryDto) { return this.portal.notifications(query); }
}
