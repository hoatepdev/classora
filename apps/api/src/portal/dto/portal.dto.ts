import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { PortalAccessStatus, PortalSubjectType } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class InvitePortalSubjectDto {
  @IsEnum(PortalSubjectType)
  subjectType!: PortalSubjectType;

  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  subjectId!: string;
}

export class AcceptPortalInvitationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  token!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

export class AcceptExistingPortalInvitationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class PortalAccessStatusDto {
  @IsEnum(PortalAccessStatus)
  status!: PortalAccessStatus;
}

export class PortalScheduleQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class PortalPageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
