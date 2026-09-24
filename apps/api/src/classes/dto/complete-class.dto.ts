import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CompleteClassDto {
  @ApiProperty({ format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  completedOn!: string;
}
