import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { PERMISSIONS } from '../authorization/permissions.js';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { CommunicationService } from './communication.service.js';
import { ListCommunicationsDto, PreviewCommunicationTemplateDto, UpsertCommunicationTemplateDto } from './dto/communication.dto.js';
import { COMMUNICATION_EVENT_TYPES, type CommunicationChannel, type CommunicationEventType } from './communication.events.js';

const parseEventType = (value: string): CommunicationEventType => {
  if (!(COMMUNICATION_EVENT_TYPES as readonly string[]).includes(value)) throw new BadRequestException('Unknown communication event type');
  return value as CommunicationEventType;
};

const parseChannel = (value: string): CommunicationChannel => {
  if (value !== 'IN_APP' && value !== 'EMAIL') throw new BadRequestException('Unknown communication channel');
  return value;
};

@ApiTenantDomain('Communication') @ApiTenantErrors() @TenantRoute() @Controller()
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get('communications/templates') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ) @ApiOkResponse({ schema: arraySchema('CommunicationTemplate') })
  templates() { return this.communication.templates(); }

  @Get('communications') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ) @ApiOkResponse({ schema: schemaRef('CommunicationHistory') })
  list(@Query() query: ListCommunicationsDto) { return this.communication.list(query); }

  @Get('communications/:id') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('CommunicationMessage') })
  get(@Param('id') id: string) { return this.communication.message(id); }

  @Post('communications/:id/retry') @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('CommunicationMessage') })
  retry(@Param('id') id: string) { return this.communication.retry(id); }

  @Put('communications/templates/:eventType/:channel') @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE) @ApiInvalidRequest() @ApiOkResponse({ schema: schemaRef('CommunicationTemplate') })
  upsert(@Param('eventType') eventType: string, @Param('channel') channel: string, @Body() input: UpsertCommunicationTemplateDto) {
    return this.communication.upsertTemplate(parseEventType(eventType), parseChannel(channel), input);
  }

  @Post('communications/templates/:eventType/:channel/reset') @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE) @ApiOkResponse({ schema: schemaRef('CommunicationTemplate') })
  reset(@Param('eventType') eventType: string, @Param('channel') channel: string) {
    return this.communication.resetTemplate(parseEventType(eventType), parseChannel(channel));
  }

  @Post('communications/templates/:eventType/:channel/enable') @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE) @ApiOkResponse({ schema: schemaRef('CommunicationTemplate') })
  enable(@Param('eventType') eventType: string, @Param('channel') channel: string) {
    return this.communication.setTemplateEnabled(parseEventType(eventType), parseChannel(channel), true);
  }

  @Post('communications/templates/:eventType/:channel/disable') @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE) @ApiOkResponse({ schema: schemaRef('CommunicationTemplate') })
  disable(@Param('eventType') eventType: string, @Param('channel') channel: string) {
    return this.communication.setTemplateEnabled(parseEventType(eventType), parseChannel(channel), false);
  }

  @Post('communications/templates/:eventType/:channel/preview') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('CommunicationTemplatePreview') })
  preview(@Param('eventType') eventType: string, @Param('channel') channel: string, @Body() input: PreviewCommunicationTemplateDto) {
    return this.communication.previewTemplate(
      parseEventType(eventType),
      parseChannel(channel),
      input.body ? { subject: input.subject, body: input.body } : undefined,
    );
  }
}
