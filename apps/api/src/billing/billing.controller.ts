import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../authorization/permission.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { ApiInvalidRequest, ApiTenantDomain, ApiTenantErrors, ApiUlidParam, arraySchema, schemaRef } from '../openapi.js';
import { TenantRoute } from '../tenant/tenant-route.js';
import { BillingService } from './billing.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreateCreditNoteDto, VoidCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateDiscountDto, DisableDiscountDto } from './dto/create-discount.dto.js';
import { CreateEnrollmentDiscountDto, CreateEnrollmentPricingDto } from './dto/create-enrollment-pricing.dto.js';
import { InvoiceCommandDto } from './dto/invoice-command.dto.js';
import { CreatePricingPlanDto } from './dto/create-pricing-plan.dto.js';
import { AllocatePaymentBatchDto, RecordPaymentDto, RefundPaymentDto, ReversePaymentDto } from './dto/record-payment.dto.js';

@ApiTenantDomain('Billing') @ApiTenantErrors() @TenantRoute() @Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('pricing-plans') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('PricingPlan') }) plans() { return this.billing.plans(); }
  @Post('pricing-plans') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('PricingPlan') }) createPlan(@Body() input: CreatePricingPlanDto) { return this.billing.createPlan(input); }
  @Get('invoices') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Invoice') }) invoices(@Query('studentId') studentId?: string, @Query('asOf') asOf?: string) { return this.billing.invoices(studentId, asOf); }
  @Get('billing/overview') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: schemaRef('BillingOverview') }) overview() { return this.billing.overview(); }
  @Get('payments') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Payment') }) payments() { return this.billing.payments(); }
  @Get('customer-credit') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('CustomerCredit') }) customerCredit(@Query('studentId') studentId?: string) { return this.billing.customerCredit(studentId); }
  @Get('receivables') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Receivable') }) receivables() { return this.billing.receivables(); }
  @Get('discounts') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Discount') }) discounts() { return this.billing.discounts(); }
  @Post('discounts') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Discount') }) createDiscount(@Body() input: CreateDiscountDto) { return this.billing.createDiscount(input); }
  @Post('discounts/:id/disable') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() disableDiscount(@Param('id') id: string, @Body() input: DisableDiscountDto) { return this.billing.disableDiscount(id, input); }
  @Get('enrollment-pricing') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('EnrollmentPricing') }) enrollmentPricing(@Query('enrollmentId') enrollmentId?: string) { return this.billing.enrollmentPricing(enrollmentId); }
  @Post('enrollments/:id/pricing') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('EnrollmentPricing') }) createEnrollmentPricing(@Param('id') id: string, @Body() input: CreateEnrollmentPricingDto) { return this.billing.createEnrollmentPricing(id, input); }
  @Get('enrollment-discounts') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('EnrollmentDiscount') }) enrollmentDiscounts(@Query('enrollmentId') enrollmentId?: string) { return this.billing.enrollmentDiscounts(enrollmentId); }
  @Post('enrollments/:id/discounts') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('EnrollmentDiscount') }) createEnrollmentDiscount(@Param('id') id: string, @Body() input: CreateEnrollmentDiscountDto) { return this.billing.createEnrollmentDiscount(id, input); }
  @Get('refunds') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('Refund') }) refunds() { return this.billing.refunds(); }
  @Get('credit-notes') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiOkResponse({ schema: arraySchema('CreditNote') }) creditNotes(@Query('invoiceId') invoiceId?: string) { return this.billing.creditNotes(invoiceId); }
  @Post('invoices') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Invoice') }) createInvoice(@Body() input: CreateInvoiceDto) { return this.billing.createInvoice(input); }
  @Get('invoices/:id') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('Invoice') }) get(@Param('id') id: string, @Query('asOf') asOf?: string) { return this.billing.invoice(id, asOf); }
  @Get('students/:id/billing') @RequirePermissions(PERMISSIONS.BILLING_READ) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('StudentBilling') }) studentBilling(@Param('id') id: string) { return this.billing.studentBilling(id); }
  @Post('invoices/:id/issue') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() issue(@Param('id') id: string, @Body() input: InvoiceCommandDto) { return this.billing.issue(id, input); }
  @Post('invoices/:id/void') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() void(@Param('id') id: string, @Body() input: InvoiceCommandDto) { return this.billing.void(id, input); }
  @Post('invoices/:id/credit-notes') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() @ApiCreatedResponse({ schema: schemaRef('CreditNote') }) createCreditNote(@Param('id') id: string, @Body() input: CreateCreditNoteDto) { return this.billing.createCreditNote(id, input); }
  @Post('credit-notes/:id/issue') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() @ApiOkResponse({ schema: schemaRef('CreditNote') }) issueCreditNote(@Param('id') id: string) { return this.billing.issueCreditNote(id); }
  @Post('credit-notes/:id/void') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) @ApiUlidParam() voidCreditNote(@Param('id') id: string, @Body() input: VoidCreditNoteDto) { return this.billing.voidCreditNote(id, input); }
  @Post('payments/unallocated') @RequirePermissions(PERMISSIONS.BILLING_COLLECT) @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Payment') }) recordUnallocatedPayment(@Body() input: RecordPaymentDto) { return this.billing.recordUnallocatedPayment(input); }
  @Post('invoices/:id/payments') @RequirePermissions(PERMISSIONS.BILLING_COLLECT) @ApiUlidParam() @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Payment') }) recordPayment(@Param('id') id: string, @Body() input: RecordPaymentDto) { return this.billing.recordPayment(id, input); }
  @Post('payments/:id/allocate') @RequirePermissions(PERMISSIONS.BILLING_COLLECT) @ApiUlidParam() @ApiInvalidRequest() @ApiOkResponse({ schema: schemaRef('Payment') }) allocatePayment(@Param('id') id: string, @Body() input: AllocatePaymentBatchDto) { return this.billing.allocatePayment(id, input); }
  @Post('payments/:id/refund') @RequirePermissions(PERMISSIONS.BILLING_REFUND) @ApiUlidParam() @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Refund') }) refundPayment(@Param('id') id: string, @Body() input: RefundPaymentDto) { return this.billing.refundPayment(id, input); }
  @Post('payments/:id/reverse') @RequirePermissions(PERMISSIONS.BILLING_REFUND) @ApiUlidParam() @ApiInvalidRequest() @ApiCreatedResponse({ schema: schemaRef('Payment') }) reversePayment(@Param('id') id: string, @Body() input: ReversePaymentDto) { return this.billing.reversePayment(id, input); }
}
