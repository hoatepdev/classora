import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({ imports: [AuditModule], controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
