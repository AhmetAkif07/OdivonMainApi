import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('vet-patients')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()

  @RequirePermission('patients', 'view')
  @ApiOperation({ summary: 'List patients in the current tenant' })
  list(@Query() query: ListPatientsQueryDto) {
    return this.patients.list(query);
  }

  @Post()

  @RequirePermission('patients', 'create')
  @ApiOperation({ summary: 'Create a patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get(':id')

  @RequirePermission('patients', 'view')
  @ApiOperation({ summary: 'Get patient by id' })
  get(@Param('id') id: string) {
    return this.patients.getById(id);
  }

  @Get(':id/pedigree')
  @RequirePermission('patients', 'view')
  @ApiOperation({ summary: 'Get 3-generation pedigree tree for a patient' })
  getPedigree(@Param('id') id: string) {
    return this.patients.getPedigree(id);
  }

  @Get(':id/offspring')
  @RequirePermission('patients', 'view')
  @ApiOperation({ summary: 'Get offspring/litters of a patient' })
  getOffspring(@Param('id') id: string) {
    return this.patients.getOffspring(id);
  }

  @Get(':id/scr-certificate')
  @RequirePermission('patients', 'view')
  @ApiOperation({ summary: 'Get official SCR certificate payload for a patient' })
  getScrCertificate(@Param('id') id: string) {
    return this.patients.getScrCertificate(id);
  }

  @Patch(':id')

  @RequirePermission('patients', 'update')
  @ApiOperation({ summary: 'Update a patient' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('patients', 'delete')
  @ApiOperation({ summary: 'Soft-delete a patient' })
  async remove(@Param('id') id: string) {
    await this.patients.softDelete(id);
    return { id };
  }
}
