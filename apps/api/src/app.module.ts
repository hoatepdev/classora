import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { TenantModule } from './tenant/tenant.module.js';

@Module({
  imports: [TenantModule],
  controllers: [HealthController],
})
export class AppModule {}
