import { Injectable } from '@nestjs/common';
import { ControlDatabaseService } from '../database/control-database.service.js';

export type ResolvedTenant = {
  tenantId: string;
  tenantSlug: string;
  dbName: string;
};

@Injectable()
export class TenantResolverService {
  constructor(private readonly database: ControlDatabaseService) {}

  async resolve(hostname: string): Promise<ResolvedTenant | null> {
    const suffix = '.classora.io.vn';
    const normalizedHostname = hostname.toLowerCase().split(':')[0];

    if (!normalizedHostname.endsWith(suffix)) return null;

    const slug = normalizedHostname.slice(0, -suffix.length);
    if (!slug || slug.includes('.') || slug === 'api' || slug === 'app') return null;

    const tenant = await this.database.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, dbName: true },
    });

    return tenant
      ? { tenantId: tenant.id, tenantSlug: tenant.slug, dbName: tenant.dbName }
      : null;
  }
}
