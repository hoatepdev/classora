import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsDefined, IsEnum, IsOptional, Matches, ValidateIf } from 'class-validator';
import { DayOfWeek, ScheduleStatus } from './create-schedule.dto.js';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export class UpdateScheduleDto {
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(ulidPattern)
  teacherId?: string;

  @ApiPropertyOptional({ enum: DayOfWeek })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(timePattern)
  startTime?: string;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(timePattern)
  endTime?: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string | null;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsOptional()
  @Matches(ulidPattern)
  roomId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveUntil?: string | null;

  @ApiPropertyOptional({ enum: ScheduleStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
