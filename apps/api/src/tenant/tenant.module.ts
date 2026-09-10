import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantResolverMiddleware } from './tenant-resolver.middleware.js';
import { TenantResolverService } from './tenant-resolver.service.js';

@Module({
  providers: [TenantResolverService, TenantResolverMiddleware],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
