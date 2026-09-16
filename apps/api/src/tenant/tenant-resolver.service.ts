import { Injectable } from "@nestjs/common";
import { ControlDatabaseService } from "../database/control-database.service.js";

export const TENANT_HOST_SUFFIX = ".classora.io.vn";
export const RESERVED_TENANT_SLUGS = ["api", "app"];
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_TENANT_SLUG_LENGTH = 47;
const DEV_FALLBACK_SLUG = "demo";

export function isValidTenantSlug(slug: string) {
  return (
    slug.length <= MAX_TENANT_SLUG_LENGTH &&
    TENANT_SLUG_PATTERN.test(slug) &&
    !RESERVED_TENANT_SLUGS.includes(slug)
  );
}

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
    const normalizedHostname = hostname.toLowerCase().split(":")[0];

    if (normalizedHostname.endsWith(TENANT_HOST_SUFFIX)) {
      const slug = normalizedHostname.slice(0, -TENANT_HOST_SUFFIX.length);
      if (!isValidTenantSlug(slug)) return null;
      return this.resolveBySlug(slug);
    }

    const devTenantSlug = process.env.DEV_TENANT_SLUG;
    if (process.env.NODE_ENV === "production" || !devTenantSlug) return null;
    return this.resolveBySlug(devTenantSlug);
  }
}
