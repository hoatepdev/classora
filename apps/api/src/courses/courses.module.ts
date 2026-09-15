import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [TenantModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
