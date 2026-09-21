import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import type { Pool } from 'pg';
import { IS_TENANT_ROUTE, TENANT_DATABASE_ROUTE } from './tenant-route.js';
import { TenantConnectionManager } from './tenant-connection-manager.service.js';
import { TenantContextService } from './tenant-context.service.js';
import type { TenantRequest } from './tenant-membership.guard.js';
import type { RequestWithId } from '../request-logging.js';

@Injectable()
export class TenantConnectionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly connections: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const isDatabaseRoute = this.reflector.getAllAndOverride<boolean>(TENANT_DATABASE_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isDatabaseRoute) return next.handle();

    const request = context.switchToHttp().getRequest<TenantRequest & RequestWithId>();
    const tenant = request.tenant;
    if (!tenant) throw new UnauthorizedException();

    return new Observable((subscriber) => {
      let pool: Pool | undefined;
      let subscription: { unsubscribe(): void } | undefined;
      let cancelled = false;

      void this.connections
        .getConnection(tenant.dbName)
        .then((connection) => {
          pool = connection;
          if (cancelled) {
            this.connections.releaseConnection(tenant.dbName, connection);
            return;
          }

          this.tenantContext.run({
            tenant,
            pool: connection,
            actorUserId: request.user?.id,
            actorMembershipId: request.membership?.id,
            actorName: request.membership?.user?.name,
            actorEmail: request.membership?.user?.email,
            requestId: request.requestId,
          }, () => {
            subscription = next.handle().subscribe(subscriber);
          });
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        cancelled = true;
        subscription?.unsubscribe();
        if (pool) this.connections.releaseConnection(tenant.dbName, pool);
      };
    });
  }
}
