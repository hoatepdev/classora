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
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { TeacherIdDto } from './dto/teacher-id.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import { TeachersService } from './teachers.service.js';

@ApiTenantDomain('Teachers')
@ApiTenantErrors()
@TenantRoute()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ApiOkResponse({ schema: arraySchema('Teacher') })
  list() {
    return this.teachers.list();
  }

  @Get(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Teacher') })
  get(@Param() { id }: TeacherIdDto) {
    return this.teachers.get(id);
  }

  @Post()
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Teacher') })
  @ApiConflictResponse({ description: 'Teacher code already exists', ...errorResponse })
  create(@Body() input: CreateTeacherDto) {
    return this.teachers.create(input);
  }

  @Patch(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Teacher') })
  @ApiConflictResponse({ description: 'Teacher code already exists', ...errorResponse })
  update(@Param() { id }: TeacherIdDto, @Body() input: UpdateTeacherDto) {
    return this.teachers.update(id, input);
  }
}
