import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ClassStatus } from './create-class.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class UpdateClassDto {
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  courseId?: string;

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

  @ApiPropertyOptional({ enum: ClassStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(ClassStatus)
  status?: ClassStatus;
}
