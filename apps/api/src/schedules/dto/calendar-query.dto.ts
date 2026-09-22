import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';
import { DayOfWeek } from './create-schedule.dto.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}

export class CalendarQueryDto {
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  from!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  to!: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  classId?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  teacherId?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  roomId?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @IsOptional()
  @Matches(ulidPattern)
  studentId?: string;

  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
