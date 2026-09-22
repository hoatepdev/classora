import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { EnrollmentCommandDto, TransferEnrollmentDto } from './dto/update-enrollment.dto.js';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { StudentIdDto } from '../students/dto/student-id.dto.js';
import { EnrollmentIdDto } from './dto/enrollment-id.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

@ApiTenantDomain('Enrollments')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}
  @Post('enrollments') @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Enrollment') }) create(@Body() input: CreateEnrollmentDto) { return this.enrollments.create(input); }
  @Get('enrollments/:id') @RequirePermissions(PERMISSIONS.ENROLLMENT_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('Enrollment') }) get(@Param() { id }: EnrollmentIdDto) { return this.enrollments.get(id); }
  @Get('enrollments/:id/history') @RequirePermissions(PERMISSIONS.ENROLLMENT_READ) @ApiUlidParam() @ApiOkResponse({ schema: arraySchema('EnrollmentEvent') }) history(@Param() { id }: EnrollmentIdDto) { return this.enrollments.history(id); }
  @Post('enrollments/:id/activate') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() activate(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'activate', input); }
  @Post('enrollments/:id/trial') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() trial(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'trial', input); }
  @Post('enrollments/:id/pause') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() pause(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'pause', input); }
  @Post('enrollments/:id/resume') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() resume(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'resume', input); }
  @Post('enrollments/:id/withdraw') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() withdraw(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'withdraw', input); }
  @Post('enrollments/:id/complete') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() complete(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'complete', input); }
  @Post('enrollments/:id/cancel') @HttpCode(200) @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() cancel(@Param() { id }: EnrollmentIdDto, @Body() input: EnrollmentCommandDto) { return this.enrollments.transition(id, 'cancel', input); }
  @Post('enrollments/:id/transfer') @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() transfer(@Param() { id }: EnrollmentIdDto, @Body() input: TransferEnrollmentDto) { return this.enrollments.transfer(id, input); }
  @Post('enrollments/:id/reenroll') @RequirePermissions(PERMISSIONS.ENROLLMENT_WRITE) @ApiUlidParam() reenroll(@Param() { id }: EnrollmentIdDto, @Body() input: CreateEnrollmentDto) { return this.enrollments.reenroll(id, input); }
  @Get('classes/:id/students') @RequirePermissions(PERMISSIONS.ENROLLMENT_READ) @ApiUlidParam() @ApiOkResponse({ schema: arraySchema('EnrollmentStudent') }) listStudents(@Param() { id }: ClassIdDto) { return this.enrollments.listStudents(id); }
  @Get('students/:id/classes') @RequirePermissions(PERMISSIONS.ENROLLMENT_READ) @ApiUlidParam() @ApiOkResponse({ schema: arraySchema('EnrollmentClass') }) listClasses(@Param() { id }: StudentIdDto) { return this.enrollments.listClasses(id); }
}
