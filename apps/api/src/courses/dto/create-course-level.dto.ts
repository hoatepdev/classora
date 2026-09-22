import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum CourseLevelStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class CreateCourseLevelDto {
  @ApiProperty({ maxLength: 50 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ minimum: 0, default: 0 }) @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @Transform(nullable) @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional({ enum: CourseLevelStatus }) @IsOptional() @IsEnum(CourseLevelStatus) status?: CourseLevelStatus;
}
