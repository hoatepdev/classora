import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantConnectionManager } from './tenant-connection-manager.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { TenantResolverMiddleware } from './tenant-resolver.middleware.js';
import { TenantResolverService } from './tenant-resolver.service.js';

@Module({
  providers: [
    TenantResolverService,
    TenantConnectionManager,
    TenantContextService,
    TenantResolverMiddleware,
  ],
  exports: [TenantConnectionManager, TenantContextService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
