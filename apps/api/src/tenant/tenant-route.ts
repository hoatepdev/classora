import { SetMetadata } from '@nestjs/common';

export const IS_TENANT_ROUTE = 'isTenantRoute';
export const TenantRoute = () => SetMetadata(IS_TENANT_ROUTE, true);
