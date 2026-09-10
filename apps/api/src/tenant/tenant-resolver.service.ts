import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

export type ResolvedTenant = {
  tenantSlug: string;
  dbName: string;
};

@Injectable()
export class TenantResolverService implements OnModuleDestroy {
  private readonly pool = new Pool({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.CONTROL_DB_NAME ?? 'control_db',
    max: 2,
  });

  async resolve(hostname: string): Promise<ResolvedTenant | null> {
    const suffix = '.classora.io.vn';
    const normalizedHostname = hostname.toLowerCase().split(':')[0];

    if (!normalizedHostname.endsWith(suffix)) return null;

    const slug = normalizedHostname.slice(0, -suffix.length);
    if (!slug || slug.includes('.') || slug === 'api' || slug === 'app') return null;

    const result = await this.pool.query<{ slug: string; db_name: string }>(
      'SELECT slug, db_name FROM tenants WHERE slug = $1',
      [slug],
    );
    const tenant = result.rows[0];

    return tenant ? { tenantSlug: tenant.slug, dbName: tenant.db_name } : null;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
