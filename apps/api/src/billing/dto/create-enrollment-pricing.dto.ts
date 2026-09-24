import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class CreateEnrollmentPricingDto {
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) pricingPlanId?: string;
  @ApiProperty({ type: String, description: 'Non-negative VND integer string' }) @Matches(/^\d+$/) amountVnd!: string;
  @ApiProperty({ format: 'date' }) @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() effectiveUntil?: string;
}

export class CreateEnrollmentDiscountDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(id) discountId!: string;
  @ApiProperty({ type: String, description: 'Non-negative VND integer string' }) @Matches(/^\d+$/) amountVnd!: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() appliedAt?: string;
}
