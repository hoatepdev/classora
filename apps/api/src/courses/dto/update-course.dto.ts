import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CourseStatus } from './create-course.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class UpdateCourseDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ enum: CourseStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
