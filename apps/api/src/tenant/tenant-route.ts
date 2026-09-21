import { applyDecorators, SetMetadata } from '@nestjs/common';

export const IS_TENANT_ROUTE = 'isTenantRoute';
export const TENANT_DATABASE_ROUTE = 'tenantDatabaseRoute';

export const TenantRoute = (options: { database?: boolean } = {}) =>
  applyDecorators(
    SetMetadata(IS_TENANT_ROUTE, true),
    SetMetadata(TENANT_DATABASE_ROUTE, options.database !== false),
  );

export const TenantDatabaseRoute = () => SetMetadata(TENANT_DATABASE_ROUTE, true);
export const PublicRoute = () =>
  applyDecorators(SetMetadata(IS_TENANT_ROUTE, false), SetMetadata(TENANT_DATABASE_ROUTE, false));
