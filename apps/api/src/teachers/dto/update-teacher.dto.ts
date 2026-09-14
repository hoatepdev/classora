import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TeacherStatus } from './create-teacher.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const nullableEmail = ({ value }: { value: unknown }) => {
  const normalized = nullableText({ value });
  return typeof normalized === 'string' ? normalized.toLowerCase() : normalized;
};

export class UpdateTeacherDto {
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
  @MaxLength(50)
  phone?: string | null;

  @Transform(nullableEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;
}
