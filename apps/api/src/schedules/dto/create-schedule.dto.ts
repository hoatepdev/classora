import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum ScheduleStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === ''
    ? null
    : typeof value === 'string'
      ? value.trim()
      : value;

export class CreateScheduleDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(ulidPattern)
  classId!: string;

  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(ulidPattern)
  teacherId!: string;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string | null;

  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$', nullable: true })
  @IsOptional()
  @Matches(ulidPattern)
  roomId?: string | null;

  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(timePattern)
  startTime!: string;

  @ApiProperty({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(timePattern)
  endTime!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveUntil?: string | null;

  @ApiPropertyOptional({ enum: ScheduleStatus, default: ScheduleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
