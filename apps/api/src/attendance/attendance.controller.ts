import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { StudentIdDto } from '../students/dto/student-id.dto.js';
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
import { AttendanceService } from './attendance.service.js';
import { AttendanceIdDto } from './dto/attendance-id.dto.js';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto.js';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto.js';
import { UpdateAttendanceSessionDto } from './dto/update-attendance-session.dto.js';

@ApiTenantDomain('Attendance')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance-sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('AttendanceSessionDetail') })
  @ApiConflictResponse({ description: 'Attendance occurrence already exists', ...errorResponse })
  create(@Body() input: CreateAttendanceSessionDto) {
    return this.attendance.create(input);
  }

  @Get('attendance-sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('AttendanceSessionDetail') })
  get(@Param() { id }: AttendanceIdDto) {
    return this.attendance.get(id);
  }

  @Patch('attendance-sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('AttendanceSession') })
  @ApiConflictResponse({ description: 'Attendance session is already completed', ...errorResponse })
  complete(@Param() { id }: AttendanceIdDto, @Body() input: UpdateAttendanceSessionDto) {
    return this.attendance.complete(id, input);
  }

  @Get('classes/:id/attendance-sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('AttendanceSessionSummary') })
  listForClass(@Param() { id }: ClassIdDto) {
    return this.attendance.listForClass(id);
  }

  @Patch('attendance-records/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('AttendanceRecord') })
  @ApiConflictResponse({ description: 'Completed attendance cannot be edited', ...errorResponse })
  updateRecord(@Param() { id }: AttendanceIdDto, @Body() input: UpdateAttendanceRecordDto) {
    return this.attendance.updateRecord(id, input);
  }

  @Get('students/:id/attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('StudentAttendance') })
  listForStudent(@Param() { id }: StudentIdDto) {
    return this.attendance.listForStudent(id);
  }
}
