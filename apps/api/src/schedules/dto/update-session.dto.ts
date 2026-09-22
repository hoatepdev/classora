import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches, MaxLength, IsString } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateSessionDto {
  @ApiPropertyOptional({ pattern: '^[0-9-A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  teacherId?: string | null;

  @ApiPropertyOptional({ pattern: '^[0-9-A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  roomId?: string | null;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  sessionDate?: string;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional()
  @Matches(timePattern)
  startTime?: string;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional()
  @Matches(timePattern)
  endTime?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
