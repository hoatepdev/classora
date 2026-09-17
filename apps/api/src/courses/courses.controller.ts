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
import { CoursesService } from './courses.service.js';
import { CourseIdDto } from './dto/course-id.dto.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';

@ApiTenantDomain('Courses')
@ApiTenantErrors()
@TenantRoute()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @ApiOkResponse({ schema: arraySchema('Course') })
  list() {
    return this.courses.list();
  }

  @Get(':id/classes')
  @ApiUlidParam()
  @ApiOkResponse({ schema: arraySchema('CourseClass') })
  listClasses(@Param() { id }: CourseIdDto) {
    return this.courses.listClasses(id);
  }

  @Get(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Course') })
  get(@Param() { id }: CourseIdDto) {
    return this.courses.get(id);
  }

  @Post()
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Course') })
  @ApiConflictResponse({ description: 'Course code already exists', ...errorResponse })
  create(@Body() input: CreateCourseDto) {
    return this.courses.create(input);
  }

  @Patch(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Course') })
  @ApiConflictResponse({ description: 'Course code already exists', ...errorResponse })
  update(@Param() { id }: CourseIdDto, @Body() input: UpdateCourseDto) {
    return this.courses.update(id, input);
  }
}
