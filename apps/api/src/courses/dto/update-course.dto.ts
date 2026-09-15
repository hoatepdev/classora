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
  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @Transform(trim)
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
