import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AttendanceRecordStatus } from './update-attendance-record.dto.js';

export class CorrectAttendanceDto {
  @ApiProperty({ enum: AttendanceRecordStatus })
  @IsEnum(AttendanceRecordStatus)
  status!: AttendanceRecordStatus;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @ApiProperty({ type: String, maxLength: 1000, nullable: true, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
