import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class AssessmentIdDto {
  @ApiProperty({ pattern: ulid.source })
  @Matches(ulid)
  id!: string;
}

export class AssessmentResultIdDto {
  @ApiProperty({ pattern: ulid.source })
  @Matches(ulid)
  id!: string;
}

export class ProgressReportIdDto {
  @ApiProperty({ pattern: ulid.source })
  @Matches(ulid)
  id!: string;
}
