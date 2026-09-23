import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, errorResponse, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { StudentIdDto } from '../students/dto/student-id.dto.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceIdDto } from './dto/attendance-id.dto.js';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto.js';
import { BookMakeupDto } from './dto/book-makeup.dto.js';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto.js';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto.js';

@ApiTenantDomain('Attendance')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance-sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE, PERMISSIONS.SCHEDULE_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('AttendanceSessionDetail') })
  @ApiConflictResponse({ description: 'Attendance occurrence already exists', ...errorResponse })
  create(@Body() input: CreateAttendanceSessionDto) { return this.attendance.create(input); }

  @Get('attendance-sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('AttendanceSessionDetail') })
  get(@Param() { id }: AttendanceIdDto) { return this.attendance.get(id); }

  @Post('attendance-sessions/:id/initialize')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  initialize(@Param() { id }: AttendanceIdDto) { return this.attendance.initialize(id); }

  @Post('attendance-sessions/:id/finalize')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  finalize(@Param() { id }: AttendanceIdDto) { return this.attendance.finalize(id); }

  @Patch('attendance-records/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('AttendanceRecord') })
  updateRecord(@Param() { id }: AttendanceIdDto, @Body() input: UpdateAttendanceRecordDto) { return this.attendance.updateRecord(id, input); }

  @Post('attendance-records/:id/corrections')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_CORRECT)
  @ApiUlidParam()
  @ApiInvalidRequest()
  correct(@Param() { id }: AttendanceIdDto, @Body() input: CorrectAttendanceDto) { return this.attendance.correct(id, input); }

  @Get('makeup-entitlements')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  listEntitlements(@Query('studentId') studentId?: string) { return this.attendance.listEntitlements(studentId); }

  @Post('makeup-entitlements/:id/bookings')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  bookMakeup(@Param() { id }: AttendanceIdDto, @Body() input: BookMakeupDto) { return this.attendance.bookMakeup(id, input.destinationSessionId); }

  @Post('makeup-bookings/:id/cancel')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  cancelMakeup(@Param() { id }: AttendanceIdDto) { return this.attendance.cancelMakeup(id); }

  @Post('makeup-bookings/:id/rebook')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  rebookMakeup(@Param() { id }: AttendanceIdDto, @Body() input: BookMakeupDto) { return this.attendance.rebookMakeup(id, input.destinationSessionId); }

  @Get('attendance-records/:id/corrections')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('AttendanceCorrection') })
  corrections(@Param() { id }: AttendanceIdDto) { return this.attendance.corrections(id); }

  @Get('classes/:id/attendance-sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  listForClass(@Param() { id }: ClassIdDto) { return this.attendance.listForClass(id); }

  @Get('students/:id/attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  listForStudent(@Param() { id }: StudentIdDto) { return this.attendance.listForStudent(id); }
}
