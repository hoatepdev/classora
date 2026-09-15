import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { TeacherIdDto } from '../teachers/dto/teacher-id.dto.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { ScheduleIdDto } from './dto/schedule-id.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { SchedulesService } from './schedules.service.js';

@TenantRoute()
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('schedules')
  create(@Body() input: CreateScheduleDto) {
    return this.schedules.create(input);
  }

  @Get('schedules/:id')
  get(@Param() { id }: ScheduleIdDto) {
    return this.schedules.get(id);
  }

  @Patch('schedules/:id')
  update(@Param() { id }: ScheduleIdDto, @Body() input: UpdateScheduleDto) {
    return this.schedules.update(id, input);
  }

  @Get('classes/:id/schedules')
  listForClass(@Param() { id }: ClassIdDto) {
    return this.schedules.listForClass(id);
  }

  @Get('teachers/:id/schedules')
  listForTeacher(@Param() { id }: TeacherIdDto) {
    return this.schedules.listForTeacher(id);
  }
}
