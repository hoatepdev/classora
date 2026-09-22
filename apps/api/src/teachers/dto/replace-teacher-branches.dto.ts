import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString, Matches } from 'class-validator';

const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class ReplaceTeacherBranchesDto {
  @ApiProperty({ type: [String], description: 'Branch IDs assigned to the teacher' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Matches(ulid, { each: true })
  branchIds!: string[];
}
