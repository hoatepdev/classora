import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateGuardianDto } from './guardian.dto.js';

const nullableText = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

export class CreateGuardianLinkDto extends CreateGuardianDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBillingContact?: boolean;
}
