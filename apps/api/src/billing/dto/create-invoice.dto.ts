import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export class CreateInvoiceItemDto {
  @ApiProperty({ maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @ApiProperty({ type: String }) @Matches(/^[1-9]\d*$/) quantity!: string;
  @ApiProperty({ type: String }) @Matches(/^\d+$/) unitAmountVnd!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) enrollmentId?: string;
}
export class CreateInvoiceDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(id) studentId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) enrollmentId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) pricingPlanId?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ type: String, default: '0' }) @IsOptional() @Matches(/^\d+$/) discountVnd?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ type: [CreateInvoiceItemDto], description: 'Optional when enrollment pricing or pricingPlanId supplies the invoice item' }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceItemDto) items?: CreateInvoiceItemDto[];
}
