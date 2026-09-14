import { Matches } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class CreateEnrollmentDto {
  @Matches(ulidPattern)
  studentId!: string;

  @Matches(ulidPattern)
  classId!: string;
}
