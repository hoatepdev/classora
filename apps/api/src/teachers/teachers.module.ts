import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

@Module({
  imports: [TenantModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
