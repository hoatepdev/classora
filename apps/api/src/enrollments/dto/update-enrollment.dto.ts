import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class EnrollmentCommandDto {
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() effectiveAt?: string;
}

export class TransferEnrollmentDto extends EnrollmentCommandDto {
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) destinationClassId!: string;
}
