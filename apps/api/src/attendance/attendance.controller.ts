import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { StudentIdDto } from '../students/dto/student-id.dto.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceIdDto } from './dto/attendance-id.dto.js';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto.js';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto.js';
import { UpdateAttendanceSessionDto } from './dto/update-attendance-session.dto.js';

@TenantRoute()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance-sessions')
  create(@Body() input: CreateAttendanceSessionDto) {
    return this.attendance.create(input);
  }

  @Get('attendance-sessions/:id')
  get(@Param() { id }: AttendanceIdDto) {
    return this.attendance.get(id);
  }

  @Patch('attendance-sessions/:id')
  complete(@Param() { id }: AttendanceIdDto, @Body() input: UpdateAttendanceSessionDto) {
    return this.attendance.complete(id, input);
  }

  @Get('classes/:id/attendance-sessions')
  listForClass(@Param() { id }: ClassIdDto) {
    return this.attendance.listForClass(id);
  }

  @Patch('attendance-records/:id')
  updateRecord(@Param() { id }: AttendanceIdDto, @Body() input: UpdateAttendanceRecordDto) {
    return this.attendance.updateRecord(id, input);
  }

  @Get('students/:id/attendance')
  listForStudent(@Param() { id }: StudentIdDto) {
    return this.attendance.listForStudent(id);
  }
}
