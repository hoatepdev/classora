import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantResolverService, type ResolvedTenant } from './tenant-resolver.service.js';

export type TenantRequest = Request & { tenant?: ResolvedTenant };

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(private readonly tenantResolver: TenantResolverService) {}

  async use(request: TenantRequest, _response: Response, next: NextFunction) {
    request.tenant = (await this.tenantResolver.resolve(request.hostname)) ?? undefined;
    next();
  }
}
