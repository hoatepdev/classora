import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { StudentIdDto } from './dto/student-id.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

@TenantRoute()
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list() {
    return this.students.list();
  }

  @Get(':id')
  get(@Param() { id }: StudentIdDto) {
    return this.students.get(id);
  }

  @Post()
  create(@Body() input: CreateStudentDto) {
    return this.students.create(input);
  }

  @Patch(':id')
  update(@Param() { id }: StudentIdDto, @Body() input: UpdateStudentDto) {
    return this.students.update(id, input);
  }
}
