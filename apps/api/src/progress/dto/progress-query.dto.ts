import { IsDateString, IsOptional, Matches } from 'class-validator';

export class ProgressSummaryQueryDto {
  @IsOptional()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  classId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  periodStart?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  periodEnd?: string;
}
