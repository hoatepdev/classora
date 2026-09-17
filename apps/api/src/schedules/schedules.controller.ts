import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
import { SchedulesService } from './schedules.service.js';

@ApiTenantDomain('Schedules')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('schedules')
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Schedule') })
  @ApiConflictResponse({ description: 'Schedule conflicts with an existing schedule', ...errorResponse })
  create(@Body() input: CreateScheduleDto) {
    return this.schedules.create(input);
  }

  @Get('schedules/:id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Schedule') })
  get(@Param() { id }: ScheduleIdDto) {
    return this.schedules.get(id);
  }

  @Patch('schedules/:id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Schedule') })
  @ApiConflictResponse({ description: 'Schedule conflicts with an existing schedule', ...errorResponse })
  update(@Param() { id }: ScheduleIdDto, @Body() input: UpdateScheduleDto) {
    return this.schedules.update(id, input);
  }

  @Get('classes/:id/schedules')
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('ClassSchedule') })
  listForClass(@Param() { id }: ClassIdDto) {
    return this.schedules.listForClass(id);
  }

  @Get('teachers/:id/schedules')
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('TeacherSchedule') })
  listForTeacher(@Param() { id }: TeacherIdDto) {
    return this.schedules.listForTeacher(id);
  }
}
