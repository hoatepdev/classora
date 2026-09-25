import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { GUARDIAN_RELATIONSHIPS } from '../crm-shared.js';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class TrialBookingIdDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) id!: string;
}

export class BookTrialDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) sessionId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', description: 'Reuse an existing Student. Required unless createStudent is true.' }) @IsOptional() @Matches(ulidPattern) studentId?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Materialize a Student from Lead data. Required unless studentId is set.' }) @IsOptional() @IsBoolean() createStudent?: boolean;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', description: 'Reuse an existing Guardian instead of creating one from Lead data.' }) @IsOptional() @Matches(ulidPattern) guardianId?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Create and link a Guardian from Lead guardian data.' }) @IsOptional() @IsBoolean() createGuardian?: boolean;
  @ApiPropertyOptional({ enum: GUARDIAN_RELATIONSHIPS, default: 'OTHER' }) @IsOptional() @IsEnum(GUARDIAN_RELATIONSHIPS) guardianRelationship?: (typeof GUARDIAN_RELATIONSHIPS)[number];
}

export class CancelTrialBookingDto {
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @Transform(trim) @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}

export class TrialOutcomeDto {
  @ApiProperty({ enum: ['ENROLL', 'FOLLOW_UP', 'LOST'] }) @IsIn(['ENROLL', 'FOLLOW_UP', 'LOST']) outcome!: 'ENROLL' | 'FOLLOW_UP' | 'LOST';
  @ApiPropertyOptional({ enum: ['PRICE', 'SCHEDULE', 'NO_RESPONSE', 'COMPETITOR', 'NOT_INTERESTED', 'LOCATION', 'OTHER'], description: 'Required when outcome is LOST.' })
  @IsOptional() @IsIn(['PRICE', 'SCHEDULE', 'NO_RESPONSE', 'COMPETITOR', 'NOT_INTERESTED', 'LOCATION', 'OTHER']) lostReason?: 'PRICE' | 'SCHEDULE' | 'NO_RESPONSE' | 'COMPETITOR' | 'NOT_INTERESTED' | 'LOCATION' | 'OTHER';
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @Transform(trim) @IsOptional() @IsString() @MaxLength(500) lostDetail?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true }) @Transform(trim) @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class ConvertLeadDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) classId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', description: 'Reuse an existing Student. Required unless createStudent is true.' }) @IsOptional() @Matches(ulidPattern) studentId?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Materialize a Student from Lead data. Required unless studentId is set.' }) @IsOptional() @IsBoolean() createStudent?: boolean;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', description: 'Reuse an existing Guardian instead of creating one from Lead data.' }) @IsOptional() @Matches(ulidPattern) guardianId?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Create and link a Guardian from Lead guardian data.' }) @IsOptional() @IsBoolean() createGuardian?: boolean;
  @ApiPropertyOptional({ enum: GUARDIAN_RELATIONSHIPS, default: 'OTHER' }) @IsOptional() @IsEnum(GUARDIAN_RELATIONSHIPS) guardianRelationship?: (typeof GUARDIAN_RELATIONSHIPS)[number];
}

export class TrialSessionQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) courseId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) courseLevelId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', description: 'Ranks matching-branch sessions first; not a hard filter.' }) @IsOptional() @Matches(ulidPattern) branchId?: string;
}
