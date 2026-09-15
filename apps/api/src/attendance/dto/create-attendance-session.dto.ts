import { IsDateString, IsOptional, Matches } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAttendanceSessionDto {
  @Matches(ulidPattern)
  classId!: string;

  @IsOptional()
  @Matches(ulidPattern)
  scheduleId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  teacherId?: string;

  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sessionDate!: string;

  @IsOptional()
  @Matches(timePattern)
  startTime?: string;

  @IsOptional()
  @Matches(timePattern)
  endTime?: string;
}
