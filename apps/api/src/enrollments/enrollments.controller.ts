import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { EnrollmentIdDto } from './dto/enrollment-id.dto.js';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

@ApiTenantDomain('Enrollments')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('enrollments')
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Enrollment') })
  @ApiConflictResponse({ description: 'Student is already enrolled', ...errorResponse })
  create(@Body() input: CreateEnrollmentDto) {
    return this.enrollments.create(input);
  }

  @Patch('enrollments/:id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Enrollment') })
  @ApiConflictResponse({ description: 'Enrollment is already withdrawn', ...errorResponse })
  withdraw(@Param() { id }: EnrollmentIdDto, @Body() input: UpdateEnrollmentDto) {
    return this.enrollments.withdraw(id, input);
  }

  @Get('classes/:id/students')
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('EnrollmentStudent') })
  listStudents(@Param() { id }: ClassIdDto) {
    return this.enrollments.listStudents(id);
  }

  @Get('students/:id/classes')
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('EnrollmentClass') })
  listClasses(@Param() { id }: StudentIdDto) {
    return this.enrollments.listClasses(id);
  }
}
