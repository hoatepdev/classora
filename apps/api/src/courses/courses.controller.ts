import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CoursesService } from './courses.service.js';
import { CourseIdDto } from './dto/course-id.dto.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';

@TenantRoute()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list() {
    return this.courses.list();
  }

  @Get(':id/classes')
  listClasses(@Param() { id }: CourseIdDto) {
    return this.courses.listClasses(id);
  }

  @Get(':id')
  get(@Param() { id }: CourseIdDto) {
    return this.courses.get(id);
  }

  @Post()
  create(@Body() input: CreateCourseDto) {
    return this.courses.create(input);
  }

  @Patch(':id')
  update(@Param() { id }: CourseIdDto, @Body() input: UpdateCourseDto) {
    return this.courses.update(id, input);
  }
}
