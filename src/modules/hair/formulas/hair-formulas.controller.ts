import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { CreateHairFormulaDto, CreateHairMediaDto, UpdateHairFormulaDto } from './formula.dto';
import { HairFormulasService } from './hair-formulas.service';

@ApiTags('hair-formulas')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/customers/:customerId')
export class HairFormulasController {
  constructor(private readonly formulas: HairFormulasService) {}

  @Get('formulas')
  @RequirePermission('hairFormulas', 'view')
  list(@Param('customerId') customerId: string) {
    return this.formulas.list(customerId);
  }

  @Post('formulas')
  @RequirePermission('hairFormulas', 'create')
  create(@Param('customerId') customerId: string, @Body() dto: CreateHairFormulaDto) {
    return this.formulas.create(customerId, dto);
  }

  @Patch('formulas/:fid')
  @RequirePermission('hairFormulas', 'update')
  update(
    @Param('customerId') customerId: string,
    @Param('fid') fid: string,
    @Body() dto: UpdateHairFormulaDto,
  ) {
    return this.formulas.update(customerId, fid, dto);
  }

  @Get('media')
  @RequirePermission('hairFormulas', 'view')
  @ApiOperation({ summary: 'Photos of the customer, newest first' })
  media(@Param('customerId') customerId: string) {
    return this.formulas.listMedia(customerId);
  }

  @Post('media')
  @RequirePermission('hairFormulas', 'create')
  @ApiOperation({ summary: 'Record an uploaded photo (needs consentPhotos)' })
  addMedia(@Param('customerId') customerId: string, @Body() dto: CreateHairMediaDto) {
    return this.formulas.addMedia(customerId, dto);
  }
}
