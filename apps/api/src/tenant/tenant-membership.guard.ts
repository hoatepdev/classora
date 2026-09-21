import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { IS_TENANT_ROUTE } from './tenant-route.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { TenantResolverService, type ResolvedTenant } from './tenant-resolver.service.js';
import { permissionsForRole, type Permission } from '../authorization/permissions.js';
import type { TenantRole } from '../generated/prisma/enums.js';

export type TenantRequest = AuthenticatedRequest & {
  tenant?: ResolvedTenant;
  membership?: {
    id: string;
    userId: string;
    role: TenantRole;
    status: 'ACTIVE' | 'DISABLED';
    permissions: Permission[];
    user?: { name: string; email: string };
  };
};

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantResolver: TenantResolverService,
    private readonly database: ControlDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isTenantRoute = this.reflector.getAllAndOverride<boolean>(IS_TENANT_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isTenantRoute) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user) throw new UnauthorizedException();

    const tenant = await this.tenantResolver.resolve(request.hostname);
    if (!tenant) throw new NotFoundException('Tenant not found');

    const membership = await this.database.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.tenantId, userId: request.user.id },
      },
      select: { id: true, userId: true, role: true, status: true, user: { select: { name: true, email: true } } },
    });
    if (!membership || (membership.status !== undefined && membership.status !== 'ACTIVE')) throw new ForbiddenException();

    request.tenant = tenant;
    request.membership = {
      ...membership,
      status: membership.status ?? 'ACTIVE',
      permissions: permissionsForRole(membership.role),
      user: membership.user,
    };
    return true;
  }
}
