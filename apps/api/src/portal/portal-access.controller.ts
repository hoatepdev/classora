import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.guard.js';
import { Public } from '../auth/auth.guard.js';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { PortalAccessStatus, PortalSubjectType } from '../generated/prisma/enums.js';
import type { RequestWithId } from '../request-logging.js';
import { PublicRoute, TenantRoute } from '../tenant/tenant-route.js';
import { AcceptExistingPortalInvitationDto, AcceptPortalInvitationDto, InvitePortalSubjectDto, PortalAccessStatusDto } from './dto/portal.dto.js';
import { PortalAccessService } from './portal-access.service.js';

@ApiTags('Portal access')
@ApiBearerAuth()
@TenantRoute()
@Controller('portal-access')
export class PortalAccessAdminController {
  constructor(private readonly portalAccess: PortalAccessService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  list() { return this.portalAccess.list(); }

  @Get('subjects')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  subjects(@Query('type', new ParseEnumPipe(PortalSubjectType)) type: PortalSubjectType, @Query('search') search?: string) {
    return this.portalAccess.subjectsForInvite(type, search);
  }

  @Post('invitations')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  invite(@CurrentUser() user: AuthenticatedUser, @Body() input: InvitePortalSubjectDto, @Req() request: RequestWithId) {
    return this.portalAccess.invite(user.id, input, request);
  }

  @Post('invitations/:id/resend')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  resend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() request: RequestWithId) {
    return this.portalAccess.resend(user.id, id, request);
  }

  @Delete('invitations/:id')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  revoke(@Param('id') id: string, @Req() request: RequestWithId) { return this.portalAccess.revoke(id, request); }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  setStatus(@Param('id') id: string, @Body() input: PortalAccessStatusDto, @Req() request: RequestWithId) {
    return this.portalAccess.setStatus(id, input.status, request);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  remove(@Param('id') id: string, @Req() request: RequestWithId) { return this.portalAccess.remove(id, request); }
}

@ApiTags('Portal invitations')
@Controller('portal/invitations')
export class PortalInvitationController {
  constructor(private readonly portalAccess: PortalAccessService) {}

  @Public()
  @PublicRoute()
  @Post('accept')
  accept(@Req() request: RequestWithId, @Body() input: AcceptPortalInvitationDto) {
    return this.portalAccess.acceptNew(request.hostname, input, request);
  }

  @PublicRoute()
  @Post('accept-existing')
  acceptExisting(@Req() request: RequestWithId, @CurrentUser() user: AuthenticatedUser, @Body() input: AcceptExistingPortalInvitationDto) {
    return this.portalAccess.acceptExisting(request.hostname, input.token, user.id, request);
  }
}
