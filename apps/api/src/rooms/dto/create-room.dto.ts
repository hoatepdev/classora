import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export enum RoomStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class CreateRoomDto {
  @ApiProperty({ maxLength: 50 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @ApiProperty({ maxLength: 200 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiProperty({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/) branchId!: string;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) capacity?: number | null;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @Transform(nullable) @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiPropertyOptional({ enum: RoomStatus }) @IsOptional() @IsEnum(RoomStatus) status?: RoomStatus;
}
