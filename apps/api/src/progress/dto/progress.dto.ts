import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsDefined, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export enum ProgressReportStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  SUPERSEDED = 'SUPERSEDED',
}

const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

export class CreateProgressNoteDto {
  @ApiProperty({ maxLength: 2000 })
  @Transform(nullableText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  enrollmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  classId?: string;
}

export class CreateProgressReportDto {
  @ApiProperty()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  studentId!: string;

  @ApiProperty()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  enrollmentId!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ type: String, maxLength: 4000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teacherComment?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  strengths?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  areasForImprovement?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextSteps?: string | null;
}

export class UpdateProgressReportDto {
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @Transform(nullableText)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ type: String, maxLength: 4000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teacherComment?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  strengths?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  areasForImprovement?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextSteps?: string | null;
}
