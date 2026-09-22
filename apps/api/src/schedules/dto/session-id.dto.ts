import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SessionIdDto {
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  id!: string;
}
