import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export enum BillingPeriod { ONE_TIME = 'ONE_TIME', MONTHLY = 'MONTHLY', TERM = 'TERM' }
export class CreatePricingPlanDto {
  @ApiProperty({ maxLength: 50 }) @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty({ type: String, description: 'Non-negative VND integer string' }) @IsString() @Matches(/^\d+$/) amountVnd!: string;
  @ApiPropertyOptional({ enum: BillingPeriod }) @IsOptional() @IsEnum(BillingPeriod) billingPeriod?: BillingPeriod;
}
