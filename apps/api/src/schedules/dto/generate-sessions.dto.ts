import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export class GenerateSessionsDto {
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  from!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(datePattern)
  to!: string;
}
