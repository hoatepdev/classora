import { Equals } from 'class-validator';

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
}

export class UpdateEnrollmentDto {
  @Equals(EnrollmentStatus.WITHDRAWN)
  status!: EnrollmentStatus.WITHDRAWN;
}
