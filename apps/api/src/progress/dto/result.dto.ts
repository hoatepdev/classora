import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export enum ResultStatus {
  GRADED = 'GRADED',
  EXEMPT = 'EXEMPT',
}

const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

export class CriterionScoreInputDto {
  @ApiProperty()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  criterionId!: string;

  @ApiProperty({ type: String, example: '2.50', description: 'Exact decimal string, scale 2, 0 <= score <= criterion maxScore' })
  @IsString()
  @IsNotEmpty()
  score!: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}

export class ResultInputDto {
  @ApiProperty()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  studentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  enrollmentId?: string;

  @ApiProperty({ enum: ResultStatus })
  @IsEnum(ResultStatus)
  status!: ResultStatus;

  @ApiPropertyOptional({ type: String, example: '8.50', description: 'Required for SIMPLE + GRADED; ignored for RUBRIC (derived from criterion scores)' })
  @IsOptional()
  @IsString()
  score?: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true, description: 'Assessment-specific academic feedback, never internal staff observations' })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ApiPropertyOptional({ type: [CriterionScoreInputDto], description: 'Required for RUBRIC + GRADED: every criterion must be scored' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  criterionScores?: CriterionScoreInputDto[];
}

export class SaveResultsDto {
  @ApiProperty({ type: [ResultInputDto], maxLength: 200, description: 'Bounded bulk grade entry for DRAFT assessments' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  results!: ResultInputDto[];
}

export class CorrectResultDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ enum: ResultStatus })
  @IsOptional()
  @IsEnum(ResultStatus)
  status?: ResultStatus;

  @ApiPropertyOptional({ type: String, example: '9.00', description: 'New SIMPLE score' })
  @IsOptional()
  @IsString()
  score?: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ApiPropertyOptional({ type: [CriterionScoreInputDto], description: 'New complete RUBRIC criterion scores' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  criterionScores?: CriterionScoreInputDto[];
}
