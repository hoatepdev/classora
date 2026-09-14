import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { TeacherIdDto } from './dto/teacher-id.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import { TeachersService } from './teachers.service.js';

@TenantRoute()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list() {
    return this.teachers.list();
  }

  @Get(':id')
  get(@Param() { id }: TeacherIdDto) {
    return this.teachers.get(id);
  }

  @Post()
  create(@Body() input: CreateTeacherDto) {
    return this.teachers.create(input);
  }

  @Patch(':id')
  update(@Param() { id }: TeacherIdDto, @Body() input: UpdateTeacherDto) {
    return this.teachers.update(id, input);
  }
}
