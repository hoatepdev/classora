import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
}

export class UpdateEnrollmentDto {
  @ApiProperty({ enum: [EnrollmentStatus.WITHDRAWN] })
  @Equals(EnrollmentStatus.WITHDRAWN)
  status!: EnrollmentStatus.WITHDRAWN;
}
