import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { SaveHairBranchDto, UpdateHairSettingsDto } from './core.dto';
import { HairCoreService } from './hair-core.service';

@ApiTags('hair')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair')
export class HairCoreController {
  constructor(private readonly core: HairCoreService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Current hair user, role, branches and tenant settings (seeds defaults on first call)',
  })
  me() {
    return this.core.me();
  }

  @Get('settings')
  @RequirePermission('hairSettings', 'view')
  settings() {
    return this.core.getSettings();
  }

  @Patch('settings')
  @RequirePermission('hairSettings', 'update')
  updateSettings(@Body() dto: UpdateHairSettingsDto) {
    return this.core.updateSettings(dto);
  }

  @Get('branches')
  @RequirePermission('hairBranches', 'view')
  branches() {
    return this.core.listBranches();
  }

  @Get('branches/:id')
  @RequirePermission('hairBranches', 'view')
  branch(@Param('id') id: string) {
    return this.core.getBranch(id);
  }

  @Post('branches')
  @RequirePermission('hairBranches', 'create')
  createBranch(@Body() dto: SaveHairBranchDto) {
    return this.core.createBranch(dto);
  }

  @Patch('branches/:id')
  @RequirePermission('hairBranches', 'update')
  updateBranch(@Param('id') id: string, @Body() dto: SaveHairBranchDto) {
    return this.core.updateBranch(id, dto);
  }

  @Delete('branches/:id')
  @RequirePermission('hairBranches', 'delete')
  @ApiOperation({ summary: 'Soft-delete a branch (the last active branch cannot be deleted)' })
  deleteBranch(@Param('id') id: string) {
    return this.core.deleteBranch(id);
  }
}
