import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export enum DiscountKind { PERCENTAGE = 'PERCENTAGE', FIXED = 'FIXED' }

export class CreateDiscountDto {
  @ApiProperty({ maxLength: 50 }) @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty({ enum: DiscountKind }) @IsEnum(DiscountKind) kind!: DiscountKind;
  @ApiProperty({ type: String, description: 'Percentage integer or non-negative VND integer string' }) @Matches(/^\d+$/) value!: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @Matches(/^\d+$/) maxAmountVnd?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() effectiveUntil?: string;
}

export class DisableDiscountDto {
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
