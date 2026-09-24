import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export enum ClassStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED', COMPLETED = 'COMPLETED' }
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class CreateClassDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(id) courseId!: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) branchId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) courseLevelId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) defaultRoomId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) primaryTeacherId?: string | null;
  @ApiProperty({ maxLength: 50 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional({ minimum: 1, nullable: true }) @IsOptional() @IsInt() @Min(1) capacity?: number | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @IsDateString() expectedEndDate?: string | null;
  @ApiPropertyOptional({ enum: ClassStatus, default: ClassStatus.ACTIVE }) @IsOptional() @IsEnum(ClassStatus) status?: ClassStatus;
}
