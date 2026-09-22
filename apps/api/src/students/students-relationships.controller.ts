import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateGuardianDto, CreateNoteDto, CreateTagDto, LinkGuardianDto, UpdateGuardianDto } from './dto/guardian.dto.js';
import { CreateGuardianLinkDto } from './dto/create-guardian-link.dto.js';
import { StudentIdDto } from './dto/student-id.dto.js';
import { StudentGuardianParamDto } from './dto/student-guardian-param.dto.js';
import { StudentTagParamDto } from './dto/student-tag-param.dto.js';
import { StudentRelationshipsService } from './relationships.service.js';

@ApiTenantDomain('Student relationships')
@ApiTenantErrors()
@TenantRoute()
@Controller()
@RequirePermissions(PERMISSIONS.STUDENT_READ)
export class StudentsRelationshipsController {
  constructor(private readonly relationships: StudentRelationshipsService) {}

  @Get('guardians')
  @ApiOkResponse({ schema: arraySchema('Guardian') })
  listGuardians(@Query('search') search?: string) { return this.relationships.guardians(search); }

  @Post('students/:id/guardians')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('StudentGuardian') })
  createAndLinkGuardian(@Param() { id }: StudentIdDto, @Body() input: CreateGuardianLinkDto) { return this.relationships.createAndLinkGuardian(id, input); }

  @Post('guardians')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  @ApiInvalidRequest()
  @ApiCreatedResponse({ schema: schemaRef('Guardian') })
  createGuardian(@Body() input: CreateGuardianDto) { return this.relationships.createGuardian(input); }

  @Patch('guardians/:id')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  @ApiUlidParam()
  updateGuardian(@Param() { id }: StudentIdDto, @Body() input: UpdateGuardianDto) { return this.relationships.updateGuardian(id, input); }

  @Get('students/:id/guardians')
  @ApiOkResponse({ schema: arraySchema('StudentGuardian') })
  getStudentGuardians(@Param() { id }: StudentIdDto) { return this.relationships.studentGuardians(id); }

  @Get('students/:id/notes')
  @ApiOkResponse({ schema: arraySchema('StudentNote') })
  getStudentNotes(@Param() { id }: StudentIdDto) { return this.relationships.studentNotes(id); }

  @Get('students/:id/tags')
  @ApiOkResponse({ schema: arraySchema('StudentTag') })
  getStudentTags(@Param() { id }: StudentIdDto) { return this.relationships.studentTags(id); }

  @Get('students/:id/activity')
  @ApiOkResponse({ schema: arraySchema('StudentActivity') })
  getStudentActivity(@Param() { id }: StudentIdDto) { return this.relationships.studentActivity(id); }

  @Post('students/:id/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  link(@Param() params: StudentGuardianParamDto, @Body() input: LinkGuardianDto) { return this.relationships.link(params.id, params.guardianId, input); }

  @Patch('students/:id/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  updateLink(@Param() params: StudentGuardianParamDto, @Body() input: LinkGuardianDto) { return this.relationships.updateLink(params.id, params.guardianId, input); }

  @Delete('students/:id/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  unlink(@Param() params: StudentGuardianParamDto) { return this.relationships.unlink(params.id, params.guardianId); }

  @Post('students/:id/notes')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  addNote(@Param() { id }: StudentIdDto, @Body() input: CreateNoteDto) { return this.relationships.addNote(id, input); }

  @Post('students/:id/tags')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  addTag(@Param() { id }: StudentIdDto, @Body() input: CreateTagDto) { return this.relationships.createTag(id, input); }

  @Delete('students/:id/tags/:tagId')
  @RequirePermissions(PERMISSIONS.STUDENT_WRITE)
  removeTag(@Param() params: StudentTagParamDto) { return this.relationships.removeTag(params.id, params.tagId); }
}
