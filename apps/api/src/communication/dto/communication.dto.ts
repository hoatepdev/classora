import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { COMMUNICATION_EVENT_TYPES } from '../communication.events.js';

const id = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class ListCommunicationsDto {
  @ApiPropertyOptional({ enum: COMMUNICATION_EVENT_TYPES as unknown as string[] }) @IsOptional() @IsIn(COMMUNICATION_EVENT_TYPES as unknown as string[]) eventType?: string;
  @ApiPropertyOptional({ enum: ['IN_APP', 'EMAIL'] }) @IsOptional() @IsIn(['IN_APP', 'EMAIL']) channel?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] }) @IsOptional() @IsIn(['PENDING', 'SENT', 'FAILED', 'CANCELLED']) status?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) recipient?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) studentId?: string;
  @ApiPropertyOptional({ pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' }) @IsOptional() @Matches(id) leadId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class UpsertCommunicationTemplateDto {
  @ApiPropertyOptional({ maxLength: 300, description: 'Required and non-blank for EMAIL channel templates' }) @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @ApiProperty({ minLength: 1, maxLength: 5000 }) @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class PreviewCommunicationTemplateDto {
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 5000, description: 'Omit to preview the currently effective template' }) @IsOptional() @IsString() @MinLength(1) @MaxLength(5000) body?: string;
}
