import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerGroupDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string | null;
}

export class UpdateCustomerGroupDto extends PartialType(CreateCustomerGroupDto) {}
