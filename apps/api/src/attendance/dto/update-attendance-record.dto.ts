import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: AttendanceRecordStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsDefined()
  @IsEnum(AttendanceRecordStatus)
  status?: AttendanceRecordStatus;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
