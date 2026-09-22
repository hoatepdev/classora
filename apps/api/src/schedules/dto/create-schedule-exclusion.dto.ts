import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateScheduleExclusionDto {
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  date!: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class UpdateScheduleExclusionDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  date?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
