import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** One plan's change from the panel. A price of `null` stops selling that billing cycle. */
export class UpdateSaasPlanPriceDto {
  @ValidateIf((dto: UpdateSaasPlanPriceDto) => dto.monthly !== undefined && dto.monthly !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  monthly?: number | null;

  @ValidateIf((dto: UpdateSaasPlanPriceDto) => dto.yearly !== undefined && dto.yearly !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  yearly?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
