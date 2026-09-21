import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { TenantRole } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class InviteMemberDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email!: string;

  @IsEnum(TenantRole)
  role!: TenantRole;
}

export class MemberRoleDto {
  @IsEnum(TenantRole)
  role!: TenantRole;
}

export class AcceptInvitationDto {
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

export class AcceptExistingInvitationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class MemberIdDto {
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  id!: string;
}
