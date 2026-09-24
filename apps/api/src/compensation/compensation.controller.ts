import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CompensationService } from './compensation.service.js';
import { CreateCompensationAdjustmentDto, CreateCompensationAgreementDto, CreateCompensationPeriodDto, EndCompensationAgreementDto } from './dto/compensation.dto.js';

@ApiTenantDomain('Compensation')
@ApiTenantErrors()
@TenantRoute()
@Controller('compensation')
export class CompensationController {
  constructor(private readonly compensation: CompensationService) {}

  @Get('references') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiOkResponse() references() { return this.compensation.references(); }
  @Get('teachers/:teacherId') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) teacherSummary(@Param('teacherId') teacherId: string) { return this.compensation.teacherSummary(teacherId); }
  @Get('agreements') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiOkResponse({ schema: arraySchema('CompensationAgreement') }) agreements() { return this.compensation.agreements(); }
  @Get('agreements/:id') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('CompensationAgreement') }) agreement(@Param('id') id: string) { return this.compensation.getAgreement(id); }
  @Post('agreements') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('CompensationAgreement') }) createAgreement(@Body() input: CreateCompensationAgreementDto) { return this.compensation.createAgreement(input); }
  @Post('agreements/:id/end') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() endAgreement(@Param('id') id: string, @Body() input: EndCompensationAgreementDto) { return this.compensation.endAgreement(id, input); }
  @Post('agreements/:id/replace') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() replaceAgreement(@Param('id') id: string, @Body() input: CreateCompensationAgreementDto) { return this.compensation.replaceAgreement(id, input); }

  @Get('periods') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiOkResponse({ schema: arraySchema('CompensationPeriod') }) periods() { return this.compensation.periods(); }
  @Post('periods') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('CompensationPeriod') }) createPeriod(@Body() input: CreateCompensationPeriodDto) { return this.compensation.createPeriod(input); }
  @Get('periods/:id') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('CompensationPeriod') }) period(@Param('id') id: string) { return this.compensation.period(id); }
  @Get('periods/:id/statements') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiUlidParam() statements(@Param('id') id: string) { return this.compensation.statements(id); }
  @Post('periods/:id/generate') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() generate(@Param('id') id: string) { return this.compensation.generate(id); }
  @Post('periods/:id/regenerate') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() regenerate(@Param('id') id: string) { return this.compensation.generate(id); }
  @Post('periods/:id/finalize') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() finalize(@Param('id') id: string) { return this.compensation.finalize(id); }
  @Post('periods/:periodId/teachers/:teacherId/adjustments') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) addAdjustment(@Param('periodId') periodId: string, @Param('teacherId') teacherId: string, @Body() input: CreateCompensationAdjustmentDto) { return this.compensation.addAdjustment(periodId, teacherId, input); }
  @Get('statements/:id') @RequirePermissions(PERMISSIONS.COMPENSATION_READ) @ApiUlidParam() statement(@Param('id') id: string) { return this.compensation.statement(id); }
  @Delete('adjustments/:id') @RequirePermissions(PERMISSIONS.COMPENSATION_MANAGE) @ApiUlidParam() removeAdjustment(@Param('id') id: string) { return this.compensation.removeAdjustment(id); }
}
