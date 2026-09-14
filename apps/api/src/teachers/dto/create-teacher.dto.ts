import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum TeacherStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const nullableEmail = ({ value }: { value: unknown }) => {
  const normalized = nullableText({ value });
  return typeof normalized === 'string' ? normalized.toLowerCase() : normalized;
};

export class CreateTeacherDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

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

  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;
}
