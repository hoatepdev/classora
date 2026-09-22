import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullableText = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class CreateGuardianDto {
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  fullName!: string;
  @ApiPropertyOptional({ maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ format: 'email', maxLength: 254, nullable: true }) @Transform(nullableText) @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(500)
  address?: string | null;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;
}

export class UpdateGuardianDto {
  @ApiPropertyOptional({ maxLength: 200 }) @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  fullName?: string;
  @ApiPropertyOptional({ maxLength: 50, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ format: 'email', maxLength: 254, nullable: true }) @Transform(nullableText) @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(500)
  address?: string | null;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;
}

export class LinkGuardianDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @Transform(nullableText) @IsOptional() @IsString() @MaxLength(50)
  relationship?: string | null;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  isPrimaryContact?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  isBillingContact?: boolean;
}

export class CreateNoteDto {
  @ApiProperty({ maxLength: 5000 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(5000)
  content!: string;
}

export class CreateTagDto {
  @ApiProperty({ maxLength: 80 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;
}
