import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class AuditQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  action?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  entityType?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? value : Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Transform(trim)
  @IsString()
  cursor?: string;
}
