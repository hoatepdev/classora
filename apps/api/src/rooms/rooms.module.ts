import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';
@Module({imports:[AuditModule,TenantModule],controllers:[RoomsController],providers:[RoomsService]})
export class RoomsModule {}
