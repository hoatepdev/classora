import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class CreateStudentDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

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

  @ApiPropertyOptional({ enum: ['UNSPECIFIED', 'FEMALE', 'MALE', 'OTHER'], default: 'UNSPECIFIED' })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @IsIn(['UNSPECIFIED', 'FEMALE', 'MALE', 'OTHER'])
  gender?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  school?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @ApiPropertyOptional({ enum: StudentStatus, default: StudentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
