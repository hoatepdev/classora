import { Matches } from 'class-validator';

export class AttendanceIdDto {
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  id!: string;
}
