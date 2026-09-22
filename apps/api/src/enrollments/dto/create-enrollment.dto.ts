import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export enum EnrollmentInitialStatus { PENDING = 'PENDING', TRIAL = 'TRIAL', ACTIVE = 'ACTIVE' }

export class CreateEnrollmentDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) studentId!: string;
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) classId!: string;
  @ApiPropertyOptional({ enum: EnrollmentInitialStatus, default: EnrollmentInitialStatus.PENDING }) @IsOptional() @IsEnum(EnrollmentInitialStatus) status?: EnrollmentInitialStatus;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() enrolledAt?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() expectedEndDate?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) sourceEnrollmentId?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
