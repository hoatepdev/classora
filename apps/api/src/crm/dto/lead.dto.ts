import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { GUARDIAN_RELATIONSHIPS, LEAD_LOST_REASONS, LEAD_SOURCES, type LeadStatus } from '../crm-shared.js';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullableText = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : trim({ value }));
const lowerText = ({ value }: { value: unknown }) => {
  const trimmed = nullableText({ value });
  return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
};

export class LeadIdDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(ulidPattern) id!: string;
}

export class CreateLeadDto {
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) studentName!: string;
  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50) studentPhone?: string | null;
  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 254, nullable: true }) @Transform(lowerText) @IsOptional() @IsEmail() @MaxLength(254) studentEmail?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(200) guardianName?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50) guardianPhone?: string | null;
  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 254, nullable: true }) @Transform(lowerText) @IsOptional() @IsEmail() @MaxLength(254) guardianEmail?: string | null;
  @ApiPropertyOptional({ enum: LEAD_SOURCES }) @IsOptional() @IsEnum(LEAD_SOURCES) source?: (typeof LEAD_SOURCES)[number];
  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(200) campaign?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) interestedCourseId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) interestedCourseLevelId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) preferredBranchId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) assignedMembershipId?: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) @IsOptional() @IsDateString() nextFollowUpAt?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(200) studentName?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50) studentPhone?: string | null;
  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 254, nullable: true }) @Transform(lowerText) @IsOptional() @IsEmail() @MaxLength(254) studentEmail?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(200) guardianName?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50) guardianPhone?: string | null;
  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 254, nullable: true }) @Transform(lowerText) @IsOptional() @IsEmail() @MaxLength(254) guardianEmail?: string | null;
  @ApiPropertyOptional({ enum: LEAD_SOURCES, nullable: true }) @IsOptional() @IsIn(LEAD_SOURCES) source?: (typeof LEAD_SOURCES)[number] | null;
  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(200) campaign?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) interestedCourseId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) interestedCourseLevelId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) preferredBranchId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(ulidPattern) assignedMembershipId?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) @IsOptional() @IsDateString() nextFollowUpAt?: string | null;
}

export class LeadQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST'] }) @IsOptional() @IsIn(['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST']) status?: LeadStatus;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) assignedMembershipId?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) courseId?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(ulidPattern) branchId?: string;
  @ApiPropertyOptional({ enum: LEAD_SOURCES }) @IsOptional() @IsEnum(LEAD_SOURCES) source?: (typeof LEAD_SOURCES)[number];
  @ApiPropertyOptional({ enum: ['OVERDUE', 'TODAY', 'UPCOMING', 'NONE'] }) @IsOptional() @IsIn(['OVERDUE', 'TODAY', 'UPCOMING', 'NONE']) followUp?: 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE';
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) @IsOptional() limit?: number;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() cursor?: string;
}

export class LostLeadDto {
  @ApiProperty({ enum: LEAD_LOST_REASONS }) @IsEnum(LEAD_LOST_REASONS) reason!: (typeof LEAD_LOST_REASONS)[number];
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(500) detail?: string | null;
}

export class CreateLeadNoteDto {
  @ApiProperty({ maxLength: 2000 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) content!: string;
}

export class GuardianRelationshipDto {
  @ApiPropertyOptional({ enum: GUARDIAN_RELATIONSHIPS, default: 'OTHER' }) @IsOptional() @IsEnum(GUARDIAN_RELATIONSHIPS) guardianRelationship?: (typeof GUARDIAN_RELATIONSHIPS)[number];
}
