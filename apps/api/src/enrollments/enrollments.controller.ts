import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClassIdDto } from '../classes/dto/class-id.dto.js';
import { StudentIdDto } from '../students/dto/student-id.dto.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { EnrollmentIdDto } from './dto/enrollment-id.dto.js';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

@TenantRoute()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('enrollments')
  create(@Body() input: CreateEnrollmentDto) {
    return this.enrollments.create(input);
  }

  @Patch('enrollments/:id')
  withdraw(@Param() { id }: EnrollmentIdDto, @Body() input: UpdateEnrollmentDto) {
    return this.enrollments.withdraw(id, input);
  }

  @Get('classes/:id/students')
  listStudents(@Param() { id }: ClassIdDto) {
    return this.enrollments.listStudents(id);
  }

  @Get('students/:id/classes')
  listClasses(@Param() { id }: StudentIdDto) {
    return this.enrollments.listClasses(id);
  }
}
