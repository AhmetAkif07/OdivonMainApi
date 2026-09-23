import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Sekreter' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Randevu ve müşteri kayıtlarını yönetir' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({
    example: { customers: ['view', 'create', 'update'], appointments: ['view', 'create'] },
    description: 'Resource key to granted actions (view, create, update, delete)',
  })
  @IsObject()
  permissions!: Record<string, string[]>;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
