import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [TenantModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
