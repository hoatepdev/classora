import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';

@Module({
  imports: [TenantModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
