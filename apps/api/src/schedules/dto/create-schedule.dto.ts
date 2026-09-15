import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
  @Matches(ulidPattern)
  classId!: string;

  @Matches(ulidPattern)
  teacherId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @Matches(timePattern)
  startTime!: string;

  @Matches(timePattern)
  endTime!: string;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  room?: string | null;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
