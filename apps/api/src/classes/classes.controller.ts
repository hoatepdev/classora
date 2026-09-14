import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantRoute } from '../tenant/tenant-route.js';
import { ClassesService } from './classes.service.js';
import { ClassIdDto } from './dto/class-id.dto.js';
import { CreateClassDto } from './dto/create-class.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';

@TenantRoute()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list() {
    return this.classes.list();
  }

  @Get(':id')
  get(@Param() { id }: ClassIdDto) {
    return this.classes.get(id);
  }

  @Post()
  create(@Body() input: CreateClassDto) {
    return this.classes.create(input);
  }

  @Patch(':id')
  update(@Param() { id }: ClassIdDto, @Body() input: UpdateClassDto) {
    return this.classes.update(id, input);
  }
}
