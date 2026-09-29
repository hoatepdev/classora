import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '../authorization/permissions.js';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { ApiTenantDomain, ApiTenantErrors, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';
import { IMPORT_MAX_FILE_BYTES } from './data-transfer.parser.js';
import { DataTransferExportService } from './data-transfer-export.service.js';
import { DataTransferImportService } from './data-transfer-import.service.js';
import { ExportQueryDto, ImportBatchIdDto, ImportBatchesQueryDto, ImportRowsQueryDto, UpdateImportMappingDto, UploadImportBatchDto } from './data-transfer.dto.js';

function sendCsv(response: Response, fileName: string, csv: string) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.send(csv);
}

@ApiTenantDomain('DataTransfer')
@ApiTenantErrors()
@TenantRoute()
@Controller('data')
export class DataTransferController {
  constructor(
    private readonly imports: DataTransferImportService,
    private readonly exports: DataTransferExportService,
  ) {}

  @Get('import/types')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: arraySchema('ImportTypeDefinition') })
  importTypes(@Req() request: TenantRequest) {
    return this.imports.types(request.membership?.permissions ?? []);
  }

  @Get('import/templates/:type.csv')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiProduces('text/csv')
  template(@Param('type') type: string, @Req() request: TenantRequest, @Res({ passthrough: true }) response: Response) {
    sendCsv(response, `import-template-${type.toLowerCase()}.csv`, this.imports.template(type, request.membership?.permissions ?? []));
  }

  @Post('import/batches')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_FILE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['type', 'file'], properties: { type: { type: 'string', enum: ['STUDENTS', 'TEACHERS', 'COURSES', 'COURSE_LEVELS', 'CLASSES', 'ENROLLMENTS'] }, file: { type: 'string', format: 'binary', description: 'UTF-8 CSV, maximum 5 MiB, 5,000 data rows and 100 columns' } } } })
  upload(
    @Body() body: UploadImportBatchDto,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
    @Req() request: TenantRequest,
  ) {
    return this.imports.upload(body.type, file, request.membership?.permissions ?? []);
  }

  @Get('import/batches')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatchPage') })
  list(@Query() query: ImportBatchesQueryDto, @Req() request: TenantRequest) {
    return this.imports.list(query, request.membership?.permissions ?? []);
  }

  @Get('import/batches/:id')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatch') })
  get(@Param() { id }: ImportBatchIdDto, @Req() request: TenantRequest) {
    return this.imports.get(id, request.membership?.permissions ?? []);
  }

  @Get('import/batches/:id/rows')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportRowPage') })
  rows(@Param() { id }: ImportBatchIdDto, @Query() query: ImportRowsQueryDto, @Req() request: TenantRequest) {
    return this.imports.rows(id, query, request.membership?.permissions ?? []);
  }

  @Get('import/batches/:id/errors.csv')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiProduces('text/csv')
  async errorCsv(@Param() { id }: ImportBatchIdDto, @Req() request: TenantRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.imports.errorCsv(id, request.membership?.permissions ?? []);
    sendCsv(response, result.fileName, result.csv);
  }

  @Put('import/batches/:id/mapping')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatch') })
  mapping(@Param() { id }: ImportBatchIdDto, @Body() input: UpdateImportMappingDto, @Req() request: TenantRequest) {
    return this.imports.updateMapping(id, input.fields, request.membership?.permissions ?? []);
  }

  @Post('import/batches/:id/validate')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatch') })
  validate(@Param() { id }: ImportBatchIdDto, @Req() request: TenantRequest) {
    return this.imports.validate(id, request.membership?.permissions ?? []);
  }

  @Post('import/batches/:id/confirm')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatch') })
  confirm(@Param() { id }: ImportBatchIdDto, @Req() request: TenantRequest) {
    return this.imports.confirm(id, request.membership?.permissions ?? []);
  }

  @Post('import/batches/:id/cancel')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOkResponse({ schema: schemaRef('ImportBatch') })
  cancel(@Param() { id }: ImportBatchIdDto, @Req() request: TenantRequest) {
    return this.imports.cancel(id, request.membership?.permissions ?? []);
  }

  @Get('export/types')
  @RequirePermissions(PERMISSIONS.DATA_EXPORT)
  @ApiOkResponse({ schema: arraySchema('ExportTypeDefinition') })
  exportTypes(@Req() request: TenantRequest) {
    return this.exports.types(request.membership?.permissions ?? []);
  }

  @Get('export/:type.csv')
  @RequirePermissions(PERMISSIONS.DATA_EXPORT)
  @ApiProduces('text/csv')
  async exportCsv(@Param('type') type: string, @Query() query: ExportQueryDto, @Req() request: TenantRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.exports.exportCsv(type, query, request.membership?.permissions ?? []);
    sendCsv(response, result.fileName, result.csv);
  }
}
