import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
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
import { ReplaceTeacherBranchesDto } from './dto/replace-teacher-branches.dto.js';
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
  @RequirePermissions(PERMISSIONS.TEACHER_READ)
  @ApiOkResponse({ schema: arraySchema('Teacher') })
  list() {
    return this.teachers.list();
  }

  @Get(':id/branches')
  @RequirePermissions(PERMISSIONS.TEACHER_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('Branch') })
  listBranches(@Param() { id }: TeacherIdDto) {
    return this.teachers.listBranches(id);
  }

  @Put(':id/branches')
  @RequirePermissions(PERMISSIONS.TEACHER_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Teacher') })
  replaceBranches(@Param() { id }: TeacherIdDto, @Body() input: ReplaceTeacherBranchesDto) {
    return this.teachers.replaceBranches(id, input);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TEACHER_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Teacher') })
  get(@Param() { id }: TeacherIdDto) {
    return this.teachers.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEACHER_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Teacher') })
  @ApiConflictResponse({ description: 'Teacher code already exists', ...errorResponse })
  create(@Body() input: CreateTeacherDto) {
    return this.teachers.create(input);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEACHER_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Teacher') })
  @ApiConflictResponse({ description: 'Teacher code already exists', ...errorResponse })
  update(@Param() { id }: TeacherIdDto, @Body() input: UpdateTeacherDto) {
    return this.teachers.update(id, input);
  }
}
