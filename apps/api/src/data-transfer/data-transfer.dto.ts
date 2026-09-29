import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class ImportBatchesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ImportRowsQueryDto extends ImportBatchesQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'ERRORS', 'WARNINGS', 'VALID'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ALL', 'ERRORS', 'WARNINGS', 'VALID'])
  filter: 'ALL' | 'ERRORS' | 'WARNINGS' | 'VALID' = 'ALL';
}

export class ImportBatchIdDto {
  @Matches(ulidPattern)
  id!: string;
}

export class UpdateImportMappingDto {
  @IsObject()
  fields!: Record<string, string | null>;
}

export class ExportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ pattern: ulidPattern.source })
  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string;

  @ApiPropertyOptional({ pattern: ulidPattern.source })
  @IsOptional()
  @Matches(ulidPattern)
  courseId?: string;

  @ApiPropertyOptional({ pattern: ulidPattern.source })
  @IsOptional()
  @Matches(ulidPattern)
  classId?: string;
}

export class UploadImportBatchDto {
  @IsString()
  type!: string;
}
