import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { FILE_KINDS, FileKind } from './file-item.entity';

export class CreateFileItemDto {
  @ApiProperty({ enum: FILE_KINDS })
  @IsIn(FILE_KINDS)
  kind!: FileKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((dto: CreateFileItemDto) => dto.kind === 'file')
  @IsUrl({ require_tld: false })
  url?: string | null;
}

export class UpdateFileItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(FILE_KINDS)
  kind?: FileKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((dto: UpdateFileItemDto) => dto.kind === 'file' || dto.url != null)
  @IsUrl({ require_tld: false })
  url?: string | null;
}
