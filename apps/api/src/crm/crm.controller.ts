import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateLeadDto, CreateLeadNoteDto, LeadIdDto, LeadQueryDto, LostLeadDto, UpdateLeadDto } from './dto/lead.dto.js';
import { BookTrialDto, CancelTrialBookingDto, ConvertLeadDto, TrialBookingIdDto, TrialOutcomeDto, TrialSessionQueryDto } from './dto/trial.dto.js';
import { CrmService } from './crm.service.js';
import { CrmTrialsService } from './crm-trials.service.js';
import { CrmConversionService } from './crm-conversion.service.js';

@ApiTenantDomain('CRM')
@ApiTenantErrors()
@TenantRoute()
@Controller()
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly trials: CrmTrialsService,
    private readonly conversion: CrmConversionService,
  ) {}

  @Get('leads') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: schemaRef('LeadList') }) list(@Query() query: LeadQueryDto) { return this.crm.list(query); }
  @Post('leads') @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Lead') }) create(@Body() input: CreateLeadDto) { return this.crm.create(input); }
  @Get('leads/:id') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('LeadDetail') }) get(@Param() { id }: LeadIdDto) { return this.crm.get(id); }
  @Patch('leads/:id') @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('LeadDetail') }) update(@Param() { id }: LeadIdDto, @Body() input: UpdateLeadDto) { return this.crm.update(id, input); }
  @Post('leads/:id/contact') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() contact(@Param() { id }: LeadIdDto) { return this.crm.contact(id); }
  @Post('leads/:id/qualify') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() qualify(@Param() { id }: LeadIdDto) { return this.crm.qualify(id); }
  @Post('leads/:id/lost') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() lost(@Param() { id }: LeadIdDto, @Body() input: LostLeadDto) { return this.crm.lost(id, input); }
  @Post('leads/:id/convert') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() convert(@Param() { id }: LeadIdDto, @Body() input: ConvertLeadDto) { return this.conversion.convert(id, input); }
  @Post('leads/:id/notes') @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() @ApiCreatedResponse({ schema: schemaRef('LeadNote') }) addNote(@Param() { id }: LeadIdDto, @Body() input: CreateLeadNoteDto) { return this.crm.addNote(id, input); }
  @Get('leads/:id/duplicates') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiUlidParam() @ApiOkResponse({ schema: arraySchema('LeadDuplicate') }) duplicates(@Param() { id }: LeadIdDto) { return this.crm.duplicates(id); }
  @Get('leads/:id/trial-bookings') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiUlidParam() trialBookings(@Param() { id }: LeadIdDto) { return this.crm.get(id).then((lead) => lead.trialBookings); }
  @Post('leads/:id/trial-bookings') @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() bookTrial(@Param() { id }: LeadIdDto, @Body() input: BookTrialDto) { return this.trials.book(id, input); }
  @Post('trial-bookings/:id/cancel') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() cancelTrial(@Param() { id }: TrialBookingIdDto, @Body() input: CancelTrialBookingDto) { return this.trials.cancel(id, input); }
  @Post('trial-bookings/:id/outcome') @HttpCode(200) @RequirePermissions(PERMISSIONS.CRM_WRITE) @ApiUlidParam() trialOutcome(@Param() { id }: TrialBookingIdDto, @Body() input: TrialOutcomeDto) { return this.trials.outcome(id, input); }

  @Get('crm/lookups/courses') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: arraySchema('CrmCourseLookup') }) lookupCourses() { return this.crm.lookupCourses(); }
  @Get('crm/lookups/branches') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: arraySchema('CrmBranchLookup') }) lookupBranches() { return this.crm.lookupBranches(); }
  @Get('crm/lookups/classes') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: arraySchema('CrmClassLookup') }) lookupClasses() { return this.crm.lookupClasses(); }
  @Get('crm/lookups/assignees') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: arraySchema('CrmAssigneeLookup') }) lookupAssignees() { return this.crm.lookupAssignees(); }
  @Get('crm/trial-sessions') @RequirePermissions(PERMISSIONS.CRM_READ) @ApiOkResponse({ schema: arraySchema('CrmTrialSession') }) trialSessions(@Query() query: TrialSessionQueryDto) { return this.crm.lookupTrialSessions(query); }
}
