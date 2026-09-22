import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsDefined, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { ClassStatus } from './create-class.dto.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const defined = () => ValidateIf((_: object, value: unknown) => value !== undefined);

export class UpdateClassDto {
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @defined() @IsDefined() @Matches(id) courseId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @defined() @IsDefined() @Matches(id) branchId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) courseLevelId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) defaultRoomId?: string | null;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true }) @IsOptional() @Matches(id) primaryTeacherId?: string | null;
  @ApiPropertyOptional({ maxLength: 50 }) @Transform(trim) @defined() @IsDefined() @IsString() @IsNotEmpty() @MaxLength(50) code?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @Transform(trim) @defined() @IsDefined() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional({ minimum: 1, nullable: true }) @IsOptional() @IsInt() @Min(1) capacity?: number | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @IsDateString() expectedEndDate?: string | null;
  @ApiPropertyOptional({ enum: ClassStatus }) @defined() @IsDefined() @IsEnum(ClassStatus) status?: ClassStatus;
}
