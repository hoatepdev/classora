import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export enum PaymentMethod { CASH = 'CASH', BANK_TRANSFER = 'BANK_TRANSFER', CARD = 'CARD', OTHER = 'OTHER' }
export class RecordPaymentDto {
  @ApiProperty({ type: String, description: 'Positive VND integer string' }) @Matches(/^[1-9]\d*$/) amountVnd!: string;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method!: PaymentMethod;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() receivedAt?: string;
}
export class ReversePaymentDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 }) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
