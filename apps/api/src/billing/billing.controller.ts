import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { BillingService } from './billing.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreatePricingPlanDto } from './dto/create-pricing-plan.dto.js';
import { RecordPaymentDto, RefundPaymentDto, ReversePaymentDto } from './dto/record-payment.dto.js';

@ApiTenantDomain('Billing') @ApiTenantErrors() @TenantRoute() @Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('pricing-plans') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('PricingPlan') }) plans() { return this.billing.plans(); }
  @Post('pricing-plans') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('PricingPlan') }) createPlan(@Body() input: CreatePricingPlanDto) { return this.billing.createPlan(input); }
  @Get('invoices') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Invoice') }) invoices(@Query('studentId') studentId?: string) { return this.billing.invoices(studentId); }
  @Post('invoices') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Invoice') }) createInvoice(@Body() input: CreateInvoiceDto) { return this.billing.createInvoice(input); }
  @Get('invoices/:id') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiUlidParam() get(@Param('id') id: string) { return this.billing.invoice(id); }
  @Post('invoices/:id/issue') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() issue(@Param('id') id: string) { return this.billing.issue(id); }
  @Post('invoices/:id/void') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() void(@Param('id') id: string) { return this.billing.void(id); }
  @Post('payments/unallocated') @RequirePermissions(PERMISSIONS.BILLING_COLLECT) recordUnallocatedPayment(@Body() input: RecordPaymentDto) { return this.billing.recordUnallocatedPayment(input); }
  @Post('invoices/:id/payments') @RequirePermissions(PERMISSIONS.BILLING_COLLECT) @ApiUlidParam() recordPayment(@Param('id') id: string, @Body() input: RecordPaymentDto) { return this.billing.recordPayment(id, input); }
  @Post('payments/:id/refund') @RequirePermissions(PERMISSIONS.BILLING_REFUND) @ApiUlidParam() refundPayment(@Param('id') id: string, @Body() input: RefundPaymentDto) { return this.billing.refundPayment(id, input); }
  @Post('payments/:id/reverse') @RequirePermissions(PERMISSIONS.BILLING_REFUND) @ApiUlidParam() reversePayment(@Param('id') id: string, @Body() input: ReversePaymentDto) { return this.billing.reversePayment(id, input); }
}
