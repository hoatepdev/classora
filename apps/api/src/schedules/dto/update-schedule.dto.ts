import { Transform } from 'class-transformer';
import { IsDefined, IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { DayOfWeek, ScheduleStatus } from './create-schedule.dto.js';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === ''
    ? null
    : typeof value === 'string'
      ? value.trim()
      : value;

export class UpdateScheduleDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(ulidPattern)
  teacherId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(timePattern)
  startTime?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @Matches(timePattern)
  endTime?: string;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  room?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
