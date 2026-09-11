import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ResolvedTenant } from './tenant-resolver.service.js';

export type TenantContext = {
  tenant: ResolvedTenant;
  pool: Pool;
};

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): TenantContext {
    const context = this.storage.getStore();
    if (!context) throw new Error('Tenant context is not available');
    return context;
  }
}
