import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class RescheduleSessionDto {
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  sessionDate!: string;

  @ApiProperty({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(timePattern)
  startTime!: string;

  @ApiProperty({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(timePattern)
  endTime!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
