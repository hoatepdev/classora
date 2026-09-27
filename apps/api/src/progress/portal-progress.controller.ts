import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotFoundException } from '@nestjs/common';
import { schemaRef } from '../openapi.js';
import { PortalTenantRoute } from '../tenant/tenant-route.js';
import { studentProgressSummary } from './progress-summary.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';

@ApiTags('Portal') @ApiBearerAuth() @PortalTenantRoute() @Controller('portal/students/:studentId/progress')
export class PortalProgressController {
  constructor(private readonly context:TenantContextService) {}
  @Get() @ApiOkResponse({schema:schemaRef('PortalProgress')})
  async get(@Param('studentId') studentId:string){
    const {tenant,pool,portal}=this.context.get();
    if(!portal?.students.some(student=>student.id===studentId)) throw new NotFoundException('Student not found');
    const [results,reports,summary]=await Promise.all([
      pool.query(`SELECT r.id,r.assessment_id AS "assessmentId",a.title,a.type,a.assessment_date::text AS "assessmentDate",r.score::text,a.max_score::text AS "maxScore",r.status,r.comment FROM assessment_results r JOIN assessments a ON a.tenant_id=r.tenant_id AND a.id=r.assessment_id AND a.status='PUBLISHED' WHERE r.tenant_id=$1 AND r.student_id=$2 ORDER BY a.assessment_date DESC NULLS LAST,a.created_at DESC,a.id DESC`,[tenant.tenantId,studentId]),
      pool.query(`SELECT id,title,period_start::text AS "periodStart",period_end::text AS "periodEnd",snapshot,published_at AS "publishedAt",supersedes_report_id AS "supersedesReportId" FROM progress_reports WHERE tenant_id=$1 AND student_id=$2 AND status IN ('PUBLISHED','SUPERSEDED') ORDER BY published_at DESC,id DESC`,[tenant.tenantId,studentId]),
      studentProgressSummary(pool,tenant.tenantId,studentId),
    ]);
    return {summary,assessments:results.rows,reports:reports.rows};
  }
}
