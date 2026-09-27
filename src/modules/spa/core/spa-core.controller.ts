import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { SpaGuards } from '../shared/spa-guards';
import { UpdateSpaSettingsDto } from './core.dto';
import { SpaCoreService } from './spa-core.service';

@ApiTags('spa')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa')
export class SpaCoreController {
  constructor(private readonly core: SpaCoreService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Current spa user, role and tenant settings (seeds defaults on first call)',
  })
  me() {
    return this.core.me();
  }

  @Get('settings')
  @RequirePermission('spaSettings', 'view')
  settings() {
    return this.core.getSettings();
  }

  @Patch('settings')
  @RequirePermission('spaSettings', 'update')
  updateSettings(@Body() dto: UpdateSpaSettingsDto) {
    return this.core.updateSettings(dto);
  }
}
