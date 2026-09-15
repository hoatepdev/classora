import { Transform } from 'class-transformer';
import { IsDefined, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export enum AttendanceRecordStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === ''
    ? null
    : typeof value === 'string'
      ? value.trim()
      : value;

export class UpdateAttendanceRecordDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(AttendanceRecordStatus)
  status?: AttendanceRecordStatus;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
