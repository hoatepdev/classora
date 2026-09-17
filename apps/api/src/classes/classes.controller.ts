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
import { ClassesService } from './classes.service.js';
import { ClassIdDto } from './dto/class-id.dto.js';
import { CreateClassDto } from './dto/create-class.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';

@ApiTenantDomain('Classes')
@ApiTenantErrors()
@TenantRoute()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @ApiOkResponse({ schema: arraySchema('Class') })
  list() {
    return this.classes.list();
  }

  @Get(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Class') })
  get(@Param() { id }: ClassIdDto) {
    return this.classes.get(id);
  }

  @Post()
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Class') })
  @ApiConflictResponse({ description: 'Class code exists or course is disabled', ...errorResponse })
  create(@Body() input: CreateClassDto) {
    return this.classes.create(input);
  }

  @Patch(':id')
  @ApiUlidParam()
  @ApiOkResponse({ schema: schemaRef('Class') })
  @ApiConflictResponse({ description: 'Class code exists or course is disabled', ...errorResponse })
  update(@Param() { id }: ClassIdDto, @Body() input: UpdateClassDto) {
    return this.classes.update(id, input);
  }
}
