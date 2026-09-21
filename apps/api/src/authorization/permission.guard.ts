import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';
import { REQUIRED_PERMISSIONS } from './permission.decorator.js';
import type { Permission } from './permissions.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.membership || !required.every((permission) => request.membership!.permissions.includes(permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
