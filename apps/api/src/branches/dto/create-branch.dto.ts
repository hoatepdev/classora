import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum BranchStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const email = ({ value }: { value: unknown }) => { const v = nullable({ value }); return typeof v === 'string' ? v.toLowerCase() : v; };

export class CreateBranchDto {
  @ApiProperty({ maxLength: 50 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ maxLength: 500, nullable: true }) @Transform(nullable) @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @ApiPropertyOptional({ maxLength: 50, nullable: true }) @Transform(nullable) @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @ApiPropertyOptional({ maxLength: 254, nullable: true }) @Transform(email) @IsOptional() @IsEmail() @MaxLength(254) email?: string | null;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @Transform(nullable) @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiPropertyOptional({ enum: BranchStatus }) @IsOptional() @IsEnum(BranchStatus) status?: BranchStatus;
}
