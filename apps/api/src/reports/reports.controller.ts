import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiTenantDomain, ApiTenantErrors, arraySchema, schemaRef } from '../openapi.js';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { ReportQueryDto } from './report-filters.js';
import { ReportsService } from './reports.service.js';

@ApiTenantDomain('Reports')
@ApiTenantErrors()
@TenantRoute()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('catalog')
  @ApiOkResponse({ schema: arraySchema('ReportCatalogItem') })
  catalog(@Req() request: TenantRequest) {
    return this.reports.catalog(request.membership?.permissions ?? []);
  }

  @Get(':key/export.csv')
  @ApiProduces('text/csv')
  exportCsv(
    @Param('key') key: string,
    @Query() query: ReportQueryDto,
    @Req() request: TenantRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.reports.exportCsv(key, query, request.membership?.permissions ?? [], response);
  }

  @Get(':key')
  @ApiOkResponse({ schema: schemaRef('ReportResult') })
  run(@Param('key') key: string, @Query() query: ReportQueryDto, @Req() request: TenantRequest) {
    return this.reports.run(key, query, request.membership?.permissions ?? []);
  }
}
