import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { UpdateClinicParametersDto } from './clinic-parameters.dto';
import { ClinicParametersService } from './clinic-parameters.service';

@ApiTags('vet-clinic-parameters')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/clinic-parameters')
export class ClinicParametersController {
  constructor(private readonly service: ClinicParametersService) {}

  @Get()
  @RequirePermission('clinicParameters', 'view')
  get() {
    return this.service.get();
  }

  @Patch()
  @RequirePermission('clinicParameters', 'update')
  update(@Body() dto: UpdateClinicParametersDto) {
    return this.service.update(dto);
  }
}
