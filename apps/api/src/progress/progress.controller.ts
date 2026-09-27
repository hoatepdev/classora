import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CreateAssessmentDto, ReplaceCriteriaDto, UpdateAssessmentDto } from './dto/assessment.dto.js';
import { CreateProgressNoteDto, CreateProgressReportDto, UpdateProgressReportDto } from './dto/progress.dto.js';
import { ProgressSummaryQueryDto } from './dto/progress-query.dto.js';
import { CorrectResultDto, SaveResultsDto } from './dto/result.dto.js';
import { ProgressService } from './progress.service.js';

@ApiTenantDomain('Progress') @ApiTenantErrors() @TenantRoute() @Controller()
export class ProgressController {
  constructor(private readonly progress:ProgressService) {}
  @Get('classes/:classId/assessments') @RequirePermissions(PERMISSIONS.PROGRESS_READ) @ApiOkResponse({schema:arraySchema('Assessment')}) assessments(@Param('classId') id:string){return this.progress.listAssessments(id);}
  @Post('classes/:classId/assessments') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) @ApiInvalidRequest() @ApiCreatedResponse({schema:schemaRef('Assessment')}) create(@Param('classId') id:string,@Body() input:CreateAssessmentDto){return this.progress.createAssessment(id,input);}
  @Get('assessments/:id') @RequirePermissions(PERMISSIONS.PROGRESS_READ) @ApiUlidParam() @ApiOkResponse({schema:schemaRef('Assessment')}) assessment(@Param('id') id:string){return this.progress.getAssessment(id);}
  @Patch('assessments/:id') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) update(@Param('id') id:string,@Body() input:UpdateAssessmentDto){return this.progress.updateAssessment(id,input);}
  @Put('assessments/:id/criteria') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) criteria(@Param('id') id:string,@Body() input:ReplaceCriteriaDto){return this.progress.replaceCriteria(id,input);}
  @Get('assessments/:id/gradebook') @RequirePermissions(PERMISSIONS.PROGRESS_READ) gradebookView(@Param('id') id:string){return this.progress.gradebook(id);}
  @Put('assessments/:id/gradebook') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) gradebook(@Param('id') id:string,@Body() input:SaveResultsDto){return this.progress.saveResults(id,input);}
  @Post('assessments/:id/publish') @RequirePermissions(PERMISSIONS.PROGRESS_PUBLISH) @ApiConflictResponse({description:'Assessment is no longer a valid draft or its scoring configuration/results are invalid'}) publish(@Param('id') id:string){return this.progress.publishAssessment(id);}
  @Post('assessments/:id/archive') @RequirePermissions(PERMISSIONS.PROGRESS_PUBLISH) @ApiConflictResponse({description:'Only a published assessment can be archived'}) archive(@Param('id') id:string){return this.progress.archiveAssessment(id);}
  @Post('assessment-results/:id/correct') @RequirePermissions(PERMISSIONS.PROGRESS_PUBLISH) @ApiConflictResponse({description:'Concurrent correction conflict or result is not published'}) correct(@Param('id') id:string,@Body() input:CorrectResultDto){return this.progress.correctResult(id,input);}
  @Get('assessment-results/:id/revisions') @RequirePermissions(PERMISSIONS.PROGRESS_READ) revisions(@Param('id') id:string){return this.progress.resultHistory(id);}
  @Get('assessment-results/:id') @RequirePermissions(PERMISSIONS.PROGRESS_READ) result(@Param('id') id:string){return this.progress.getResult(id);}
  @Get('students/:studentId/progress') @RequirePermissions(PERMISSIONS.PROGRESS_READ) summary(@Param('studentId') studentId:string,@Query() query:ProgressSummaryQueryDto){return query.classId||query.periodStart||query.periodEnd?this.progress.summary(studentId,query.classId,query.periodStart,query.periodEnd):this.progress.studentProgress(studentId);}
  @Get('students/:studentId/progress-notes') @RequirePermissions(PERMISSIONS.PROGRESS_READ) notes(@Param('studentId') id:string){return this.progress.notes(id);}
  @Post('students/:studentId/progress-notes') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) note(@Param('studentId') id:string,@Body() input:CreateProgressNoteDto){return this.progress.createNote(id,input);}
  @Post('progress-reports') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) createReport(@Body() input:CreateProgressReportDto){return this.progress.createReport(input);}
  @Get('progress-reports/:id') @RequirePermissions(PERMISSIONS.PROGRESS_READ) report(@Param('id') id:string){return this.progress.getReport(id);}
  @Patch('progress-reports/:id') @RequirePermissions(PERMISSIONS.PROGRESS_WRITE) updateReport(@Param('id') id:string,@Body() input:UpdateProgressReportDto){return this.progress.updateReport(id,input);}
  @Get('progress-reports/:id/preview') @RequirePermissions(PERMISSIONS.PROGRESS_READ) preview(@Param('id') id:string){return this.progress.previewReport(id);}
  @Post('progress-reports/:id/publish') @RequirePermissions(PERMISSIONS.PROGRESS_PUBLISH) @ApiConflictResponse({description:'Report is no longer a publishable draft or conflicts with another official report'}) publishReport(@Param('id') id:string){return this.progress.publishReport(id);}
  @Post('progress-reports/:id/replacement') @RequirePermissions(PERMISSIONS.PROGRESS_PUBLISH) @ApiConflictResponse({description:'Only a published report without an existing replacement can be replaced'}) replaceReport(@Param('id') id:string,@Body() input:UpdateProgressReportDto){return this.progress.replaceReport(id,input);}
  @Get('students/:studentId/progress-reports') @RequirePermissions(PERMISSIONS.PROGRESS_READ) history(@Param('studentId') id:string){return this.progress.reportHistory(id);}
}
