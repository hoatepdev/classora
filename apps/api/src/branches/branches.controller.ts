import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { BranchesService } from './branches.service.js';
import { BranchIdDto } from './dto/branch-id.dto.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';

@ApiTenantDomain('Branches') @ApiTenantErrors() @TenantRoute() @Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Get() @RequirePermissions(PERMISSIONS.BRANCH_READ) @ApiOkResponse({ schema: arraySchema('Branch') }) list(){return this.branches.list();}
  @Get(':id') @RequirePermissions(PERMISSIONS.BRANCH_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('Branch') }) get(@Param() {id}:BranchIdDto){return this.branches.get(id);}
  @Post() @RequirePermissions(PERMISSIONS.BRANCH_WRITE) @ApiInvalidRequest() @ApiCreatedResponse({schema:schemaRef('Branch')}) create(@Body() input:CreateBranchDto){return this.branches.create(input);}
  @Patch(':id') @RequirePermissions(PERMISSIONS.BRANCH_WRITE) @ApiUlidParam() @ApiOkResponse({schema:schemaRef('Branch')}) update(@Param() {id}:BranchIdDto,@Body() input:UpdateBranchDto){return this.branches.update(id,input);}
}
