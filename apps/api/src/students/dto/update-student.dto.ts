import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { StudentStatus } from './create-student.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class UpdateStudentDto {
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
  fullName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 254, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ enum: StudentStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
