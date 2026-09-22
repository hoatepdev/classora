import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { RoomsService } from './rooms.service.js';
import { RoomIdDto } from './dto/room-id.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';

@ApiTenantDomain('Rooms') @ApiTenantErrors() @TenantRoute() @Controller('rooms')
export class RoomsController {
 constructor(private readonly rooms:RoomsService){}
 @Get() @RequirePermissions(PERMISSIONS.ROOM_READ) @ApiOkResponse({schema:arraySchema('Room')}) list(@Query('branchId') branchId?:string){return this.rooms.list(branchId);}
 @Get(':id') @RequirePermissions(PERMISSIONS.ROOM_READ) @ApiUlidParam() @ApiOkResponse({schema:schemaRef('Room')}) get(@Param() {id}:RoomIdDto){return this.rooms.get(id);}
 @Post() @RequirePermissions(PERMISSIONS.ROOM_WRITE) @ApiInvalidRequest() @ApiCreatedResponse({schema:schemaRef('Room')}) create(@Body() input:CreateRoomDto){return this.rooms.create(input);}
 @Patch(':id') @RequirePermissions(PERMISSIONS.ROOM_WRITE) @ApiUlidParam() @ApiOkResponse({schema:schemaRef('Room')}) update(@Param() {id}:RoomIdDto,@Body() input:UpdateRoomDto){return this.rooms.update(id,input);}
}
