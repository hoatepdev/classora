import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
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
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { StudentIdDto } from './dto/student-id.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

@ApiTenantDomain('Students')
@ApiTenantErrors()
@TenantRoute()
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  @ApiOkResponse({ schema: arraySchema('Student') })
  list() {
    return this.students.list();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Student') })
  get(@Param() { id }: StudentIdDto) {
    return this.students.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Student') })
  @ApiConflictResponse({ description: 'Student code already exists', ...errorResponse })
  create(@Body() input: CreateStudentDto) {
    return this.students.create(input);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Student') })
  @ApiConflictResponse({ description: 'Student code already exists', ...errorResponse })
  update(@Param() { id }: StudentIdDto, @Body() input: UpdateStudentDto) {
    return this.students.update(id, input);
  }
}
