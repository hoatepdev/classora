import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
import { CoursesService } from './courses.service.js';
import { CourseLevelIdDto } from './dto/course-level-id.dto.js';
import { CourseIdDto } from './dto/course-id.dto.js';
import { CreateCourseLevelDto } from './dto/create-course-level.dto.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseLevelDto } from './dto/update-course-level.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';

@ApiTenantDomain('Courses')
@ApiTenantErrors()
@TenantRoute()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COURSE_READ)
  @ApiOkResponse({ schema: arraySchema('Course') })
  list() {
    return this.courses.list();
  }

  @Get(':id/levels')
  @RequirePermissions(PERMISSIONS.COURSE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('CourseLevel') })
  listLevels(@Param() { id }: CourseIdDto) {
    return this.courses.listLevels(id);
  }

  @Post(':id/levels')
  @RequirePermissions(PERMISSIONS.COURSE_WRITE)
  @ApiUlidParam()
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('CourseLevel') })
  createLevel(@Param() { id }: CourseIdDto, @Body() input: CreateCourseLevelDto) {
    return this.courses.createLevel(id, input);
  }

  @Patch(':id/levels/:levelId')
  @RequirePermissions(PERMISSIONS.COURSE_WRITE)
  @ApiOkResponse({ schema: schemaRef('CourseLevel') })
  updateLevel(@Param() params: CourseLevelIdDto, @Body() input: UpdateCourseLevelDto) {
    return this.courses.updateLevel(params.id, params.levelId, input);
  }

  @Get(':id/classes')
  @RequirePermissions(PERMISSIONS.COURSE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('CourseClass') })
  listClasses(@Param() { id }: CourseIdDto) {
    return this.courses.listClasses(id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COURSE_READ)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Course') })
  get(@Param() { id }: CourseIdDto) {
    return this.courses.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COURSE_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Course') })
  @ApiConflictResponse({ description: 'Course code already exists', ...errorResponse })
  create(@Body() input: CreateCourseDto) {
    return this.courses.create(input);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COURSE_WRITE)
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Course') })
  @ApiConflictResponse({ description: 'Course code already exists', ...errorResponse })
  update(@Param() { id }: CourseIdDto, @Body() input: UpdateCourseDto) {
    return this.courses.update(id, input);
  }
}
