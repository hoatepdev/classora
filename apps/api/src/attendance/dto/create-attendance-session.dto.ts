import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAttendanceSessionDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(ulidPattern)
  classId!: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  scheduleId?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  teacherId?: string;

  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sessionDate!: string;

  @ApiPropertyOptional({
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
    description: 'Required when scheduleId is omitted.',
  })
  @IsOptional()
  @Matches(timePattern)
  startTime?: string;

  @ApiPropertyOptional({
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
    description: 'Required when scheduleId is omitted.',
  })
  @IsOptional()
  @Matches(timePattern)
  endTime?: string;
}
