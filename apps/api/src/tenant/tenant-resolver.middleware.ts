import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantConnectionManager } from './tenant-connection-manager.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { TenantResolverService, type ResolvedTenant } from './tenant-resolver.service.js';

export type TenantRequest = Request & { tenant?: ResolvedTenant };

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly connections: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(request: TenantRequest, response: Response, next: NextFunction) {
    try {
      const tenant = await this.tenantResolver.resolve(request.hostname);
      request.tenant = tenant ?? undefined;
      if (!tenant) return next();

      const pool = await this.connections.getConnection(tenant.dbName);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.connections.releaseConnection(tenant.dbName, pool);
      };
      response.once('finish', release);
      response.once('close', release);

      this.tenantContext.run({ tenant, pool }, next);
    } catch (error) {
      next(error);
    }
  }
}
