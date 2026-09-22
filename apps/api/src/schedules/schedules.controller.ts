import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { TeacherIdDto } from '../teachers/dto/teacher-id.dto.js';
import {
  ApiInvalidRequest,
  ApiTenantDomain,
  ApiTenantErrors,
  ApiUlidParam,
  arraySchema,
  errorResponse,
  schemaRef,
} from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { ScheduleIdDto } from './dto/schedule-id.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { CalendarQueryDto } from './dto/calendar-query.dto.js';
import { GenerateSessionsDto } from './dto/generate-sessions.dto.js';
import { SessionIdDto } from './dto/session-id.dto.js';
import { UpdateSessionDto } from './dto/update-session.dto.js';
import { RescheduleSessionDto } from './dto/reschedule-session.dto.js';
import { CreateScheduleExclusionDto, UpdateScheduleExclusionDto } from './dto/create-schedule-exclusion.dto.js';
import { ScheduleExclusionIdDto } from './dto/schedule-exclusion-id.dto.js';
import { SchedulesService } from './schedules.service.js';

@ApiTenantDomain('Schedules')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('schedules')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Schedule') })
  @ApiConflictResponse({ description: 'Schedule conflicts with an existing schedule', ...errorResponse })
  create(@Body() input: CreateScheduleDto) {
    return this.schedules.create(input);
  }

  @Get('schedules/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Schedule') })
  get(@Param() { id }: ScheduleIdDto) {
    return this.schedules.get(id);
  }

  @Patch('schedules/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Schedule') })
  @ApiConflictResponse({ description: 'Schedule conflicts with an existing schedule', ...errorResponse })
  update(@Param() { id }: ScheduleIdDto, @Body() input: UpdateScheduleDto) {
    return this.schedules.update(id, input);
  }

  @Get('classes/:id/schedules')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('ClassSchedule') })
  listForClass(@Param() { id }: ClassIdDto) {
    return this.schedules.listForClass(id);
  }

  @Get('teachers/:id/schedules')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('TeacherSchedule') })
  listForTeacher(@Param() { id }: TeacherIdDto) {
    return this.schedules.listForTeacher(id);
  }

  @Post('classes/:id/sessions/generate')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  @ApiInvalidRequest()
  generate(@Param() { id }: ClassIdDto, @Body() input: GenerateSessionsDto) {
    return this.schedules.generate(id, input);
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiOkResponse({ description: 'Bounded Session calendar results' })
  listSessions(@Query() input: CalendarQueryDto) {
    return this.schedules.listSessions(input);
  }

  @Get('schedule-exclusions')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiOkResponse({ description: 'Tenant schedule exclusions' })
  listExclusions() {
    return this.schedules.listExclusions();
  }

  @Post('schedule-exclusions')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('ScheduleExclusion') })
  createExclusion(@Body() input: CreateScheduleExclusionDto) {
    return this.schedules.createExclusion(input);
  }

  @Patch('schedule-exclusions/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('ScheduleExclusion') })
  updateExclusion(@Param() { id }: ScheduleExclusionIdDto, @Body() input: UpdateScheduleExclusionDto) {
    return this.schedules.updateExclusion(id, input);
  }

  @Delete('schedule-exclusions/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ description: 'Schedule exclusion deleted' })
  deleteExclusion(@Param() { id }: ScheduleExclusionIdDto) {
    return this.schedules.deleteExclusion(id);
  }

  @Get('sessions/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  @ApiUlidParam()
  getSession(@Param() { id }: SessionIdDto) {
    return this.schedules.getSession(id);
  }

  @Patch('sessions/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  updateSession(@Param() { id }: SessionIdDto, @Body() input: UpdateSessionDto) {
    return this.schedules.updateSession(id, input);
  }

  @Post('sessions/:id/reschedule')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  rescheduleSession(@Param() { id }: SessionIdDto, @Body() input: RescheduleSessionDto) {
    return this.schedules.rescheduleSession(id, input);
  }

  @Post('sessions/:id/cancel')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  cancelSession(@Param() { id }: SessionIdDto, @Body() input: UpdateSessionDto) {
    return this.schedules.cancelSession(id, input.reason ?? '');
  }

  @Post('sessions/:id/complete')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  @ApiUlidParam()
  completeSession(@Param() { id }: SessionIdDto) {
    return this.schedules.completeSession(id);
  }
}
