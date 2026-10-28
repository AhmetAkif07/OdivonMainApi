import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TicketPriority, TicketStatus } from './tickets.entity';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';

export class CreateSupportTicketDto {
  @ApiProperty({ example: 'technical_support' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiPropertyOptional({ example: 'Teknik Destek' })
  @IsOptional()
  @IsString()
  categoryLabel?: string;

  @ApiProperty({ example: 'Turnike Kartı Okumuyor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ example: 'Turnikeden geçerken kartım hata veriyor, lütfen yardımcı olun.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  description!: string;

  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+90 532 000 00 00' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: TicketPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantName?: string;

  @ApiPropertyOptional({ enum: PRODUCT_MODULES, description: 'Product the ticket is sent from; inferred from the tenant when left out' })
  @IsOptional()
  @IsIn(PRODUCT_MODULES)
  product?: ProductModule;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: ['pending', 'in_progress', 'approved', 'completed', 'rejected'] })
  @IsIn(['pending', 'in_progress', 'approved', 'completed', 'rejected'])
  status!: TicketStatus;

  @ApiPropertyOptional({ description: 'Customer-visible response or resolution note' })
  @IsOptional()
  @IsString()
  adminNote?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: PRODUCT_MODULES, description: 'Correct the product a ticket is filed under' })
  @IsOptional()
  @IsIn(PRODUCT_MODULES)
  product?: ProductModule;
}
