import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const integer = /^[1-9]\d*$/;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export enum CompensationBasis { PER_SESSION = 'PER_SESSION', PER_HOUR = 'PER_HOUR', FIXED_CLASS = 'FIXED_CLASS' }

export class CreateCompensationAgreementDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(id) teacherId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) classId?: string | null;
  @ApiProperty({ enum: CompensationBasis }) @IsEnum(CompensationBasis) basis!: CompensationBasis;
  @ApiProperty({ pattern: '^[1-9]\\d*$', description: 'VND decimal integer string' }) @Matches(integer) rateVnd!: string;
  @ApiProperty({ format: 'date' }) @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @IsDateString() effectiveUntil?: string | null;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EndCompensationAgreementDto {
  @ApiProperty({ format: 'date' }) @IsDateString() effectiveUntil!: string;
}

export class CreateCompensationPeriodDto {
  @ApiProperty({ format: 'date' }) @IsDateString() periodStart!: string;
  @ApiProperty({ format: 'date' }) @IsDateString() periodEnd!: string;
}

export class CreateCompensationAdjustmentDto {
  @ApiProperty({ pattern: '^-?\\d+$', description: 'Signed VND decimal integer string' }) @Matches(/^-?[1-9]\d*$/) amountVnd!: string;
  @ApiProperty({ minLength: 1, maxLength: 2000 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
