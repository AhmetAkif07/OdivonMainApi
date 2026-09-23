import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Kredi kartı' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}
