import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export class CreateInvoiceDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(id) studentId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) enrollmentId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) pricingPlanId?: string;
  @ApiProperty({ maxLength: 50 }) @IsString() @MinLength(1) @MaxLength(50) invoiceNumber!: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ type: String, default: '0' }) @IsOptional() @IsString() discountVnd?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) items!: Array<{ description: string; quantity: string; unitAmountVnd: string; enrollmentId?: string }>;
}
