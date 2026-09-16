import { Injectable } from '@nestjs/common';
import { ControlDatabaseService } from '../database/control-database.service.js';

export const TENANT_HOST_SUFFIX = '.classora.io.vn';
export const RESERVED_TENANT_SLUGS = ['api', 'app'];

export type ResolvedTenant = {
  tenantId: string;
  tenantSlug: string;
  dbName: string;
};

@Injectable()
export class TenantResolverService {
  constructor(private readonly database: ControlDatabaseService) {}

  private async resolveBySlug(slug: string): Promise<ResolvedTenant | null> {
    const tenant = await this.database.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, dbName: true },
    });

    return tenant
      ? { tenantId: tenant.id, tenantSlug: tenant.slug, dbName: tenant.dbName }
      : null;
  }

  async resolve(hostname: string): Promise<ResolvedTenant | null> {
    const normalizedHostname = hostname.toLowerCase().split(':')[0];

    if (normalizedHostname.endsWith(TENANT_HOST_SUFFIX)) {
      const slug = normalizedHostname.slice(0, -TENANT_HOST_SUFFIX.length);
      if (!slug || slug.includes('.') || RESERVED_TENANT_SLUGS.includes(slug)) return null;
      return this.resolveBySlug(slug);
    }

    const devTenantSlug = process.env.DEV_TENANT_SLUG;
    if (process.env.NODE_ENV === 'production' || !devTenantSlug) return null;
    return this.resolveBySlug(devTenantSlug);
  }
}
