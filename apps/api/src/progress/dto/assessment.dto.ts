import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested, ArrayMaxSize, ArrayMinSize, ValidateIf } from 'class-validator';

export enum AssessmentType {
  QUIZ = 'QUIZ',
  TEST = 'TEST',
  EXAM = 'EXAM',
  HOMEWORK = 'HOMEWORK',
  PROJECT = 'PROJECT',
  ORAL = 'ORAL',
  OTHER = 'OTHER',
}

export enum ScoringMode {
  SIMPLE = 'SIMPLE',
  RUBRIC = 'RUBRIC',
}

export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

export class CriterionInputDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ type: String, example: '2.50', description: 'Exact decimal string, scale 2, > 0' })
  @IsString()
  @IsNotEmpty()
  maxScore!: string;
}

export class CreateAssessmentDto {
  @ApiProperty({ enum: AssessmentType })
  @IsEnum(AssessmentType)
  type!: AssessmentType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ enum: ScoringMode })
  @IsEnum(ScoringMode)
  scoringMode!: ScoringMode;

  @ApiProperty({ type: String, example: '10.00', description: 'Exact decimal string, scale 2, > 0. For RUBRIC this must equal the sum of criterion max scores.' })
  @IsString()
  @IsNotEmpty()
  maxScore!: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  assessmentDate?: string | null;

  @ApiPropertyOptional({ type: [CriterionInputDto], description: 'Required for RUBRIC: at least one criterion' })
  @ValidateIf((input) => input.scoringMode === ScoringMode.RUBRIC)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria?: CriterionInputDto[];
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional({ enum: AssessmentType })
  @IsOptional()
  @IsEnum(AssessmentType)
  type?: AssessmentType;

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @Transform(nullableText)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, example: '10.00', description: 'Exact decimal string, scale 2, > 0' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  maxScore?: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  assessmentDate?: string | null;
}

export class ReplaceCriteriaDto {
  @ApiProperty({ type: [CriterionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria!: CriterionInputDto[];
}
