import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class StudentTagParamDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(ulidPattern)
  id!: string;

  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(ulidPattern)
  tagId!: string;
}
