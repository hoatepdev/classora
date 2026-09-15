import { Equals } from 'class-validator';

export enum AttendanceSessionStatus {
  OPEN = 'OPEN',
  COMPLETED = 'COMPLETED',
}

export class UpdateAttendanceSessionDto {
  @Equals(AttendanceSessionStatus.COMPLETED)
  status!: AttendanceSessionStatus.COMPLETED;
}
