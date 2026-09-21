import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, Param, ParseEnumPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.guard.js';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { MembershipStatus } from '../generated/prisma/enums.js';
import { PublicRoute, TenantRoute } from '../tenant/tenant-route.js';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';
import type { RequestWithId } from '../request-logging.js';
import { InviteMemberDto, AcceptExistingInvitationDto, AcceptInvitationDto, MemberRoleDto } from './dto/team.dto.js';
import { TeamService } from './team.service.js';

const Tenant = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  (context.switchToHttp().getRequest<TenantRequest>().tenant?.tenantId),
);

@ApiTags('Team')
@ApiBearerAuth()
@TenantRoute({ database: false })
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('members')
  @RequirePermissions(PERMISSIONS.TEAM_READ)
  @ApiOkResponse()
  listMembers(@Tenant() tenantId: string) {
    return this.team.listMembers(tenantId);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.TEAM_READ)
  listRoles() {
    return this.team.listRoles();
  }

  @Post('invitations')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  @ApiCreatedResponse()
  invite(@Tenant() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: InviteMemberDto, @Req() request: RequestWithId) {
    return this.team.invite(tenantId, user.id, input, request);
  }

  @Post('invitations/:id/resend')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  resend(@Tenant() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') invitationId: string, @Req() request: RequestWithId) {
    return this.team.resend(tenantId, user.id, invitationId, request);
  }

  @Public()
  @PublicRoute()
  @Post('invitations/accept')
  accept(@Body() input: AcceptInvitationDto, @Req() request: RequestWithId) {
    return this.team.acceptNew(input, request);
  }

  @PublicRoute()
  @Post('invitations/accept-existing')
  acceptExisting(@Body() input: AcceptExistingInvitationDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestWithId) {
    return this.team.acceptExisting(input, user.id, request);
  }

  @Patch('members/:id/role')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  changeRole(@Tenant() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') membershipId: string, @Body() input: MemberRoleDto, @Req() request: RequestWithId) {
    return this.team.changeRole(tenantId, user.id, membershipId, input, request);
  }

  @Patch('members/:id/status/:status')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  setStatus(@Tenant() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') membershipId: string, @Param('status', new ParseEnumPipe(MembershipStatus)) status: MembershipStatus, @Req() request: RequestWithId) {
    return this.team.setStatus(tenantId, user.id, membershipId, status, request);
  }

  @Delete('members/:id')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  remove(@Tenant() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') membershipId: string, @Req() request: RequestWithId) {
    return this.team.remove(tenantId, user.id, membershipId, request);
  }
}
