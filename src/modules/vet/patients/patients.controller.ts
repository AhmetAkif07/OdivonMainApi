import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('vet-patients')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List patients in the current tenant' })
  list(@Query() query: ListPatientsQueryDto) {
    return this.patients.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by id' })
  get(@Param('id') id: string) {
    return this.patients.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a patient' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a patient' })
  async remove(@Param('id') id: string) {
    await this.patients.softDelete(id);
    return { id };
  }
}
