import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CourseLevelIdDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  id!: string;

  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  levelId!: string;
}
