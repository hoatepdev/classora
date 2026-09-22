import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export enum AttendanceSessionStatus {
  // OPEN remains a transport compatibility alias; persisted sessions use SCHEDULED.
  OPEN = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
}

export class UpdateAttendanceSessionDto {
  @ApiProperty({ enum: [AttendanceSessionStatus.COMPLETED] })
  @Equals(AttendanceSessionStatus.COMPLETED)
  status!: AttendanceSessionStatus.COMPLETED;
}
