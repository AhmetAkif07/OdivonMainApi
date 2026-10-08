import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateVetBranchDto, UpdateVetBranchDto } from './branch.dto';
import { BranchesService } from './branches.service';

@ApiTags('vet-branches')
@ApiBearerAuth()
@RequireModule('vet')
@Roles('owner', 'admin', 'user')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'Klinik şubelerini listele' })
  list() {
    return this.branches.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Şube detayı' })
  get(@Param('id') id: string) {
    return this.branches.get(id);
  }

  @Post()
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Yeni klinik şubesi oluştur' })
  create(@Body() dto: CreateVetBranchDto) {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Şube bilgilerini güncelle' })
  update(@Param('id') id: string, @Body() dto: UpdateVetBranchDto) {
    return this.branches.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Şubeyi sil / arşive al' })
  delete(@Param('id') id: string) {
    return this.branches.delete(id);
  }
}
