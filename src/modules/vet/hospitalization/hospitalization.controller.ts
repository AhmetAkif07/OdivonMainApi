import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateCageDto } from './dto/create-cage.dto';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { CreateVitalLogDto } from './dto/create-vital-log.dto';
import { ListHospitalizationsQueryDto } from './dto/list-hospitalizations.query.dto';
import { UpdateCageDto } from './dto/update-cage.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { HospitalizationService } from './hospitalization.service';

@ApiTags('vet-hospitalization')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard)
@Controller('vet')
export class HospitalizationController {
  constructor(private readonly service: HospitalizationService) {}

  // --- CAGES ---
  @Get('cages')
  @ApiOperation({ summary: 'List all cages' })
  async listCages() {
    return { data: await this.service.listCages() };
  }

  @Post('cages')
  @ApiOperation({ summary: 'Create a cage' })
  async createCage(@Body() dto: CreateCageDto) {
    return { data: await this.service.createCage(dto) };
  }

  @Put('cages/:id')
  @ApiOperation({ summary: 'Update a cage' })
  async updateCage(@Param('id') id: string, @Body() dto: UpdateCageDto) {
    return { data: await this.service.updateCage(id, dto) };
  }

  // --- HOSPITALIZATIONS ---
  @Get('hospitalizations')
  @ApiOperation({ summary: 'List hospitalizations' })
  list(@Query() query: ListHospitalizationsQueryDto) {
    return this.service.list(query);
  }

  @Post('hospitalizations')
  @ApiOperation({ summary: 'Admit a patient (hospitalization)' })
  create(@Body() dto: CreateHospitalizationDto) {
    return this.service.create(dto);
  }

  @Get('hospitalizations/:id')
  @ApiOperation({ summary: 'Get hospitalization by id' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Put('hospitalizations/:id')
  @ApiOperation({ summary: 'Update hospitalization record' })
  update(@Param('id') id: string, @Body() dto: UpdateHospitalizationDto) {
    return this.service.update(id, dto);
  }

  @Post('hospitalizations/:id/logs')
  @ApiOperation({ summary: 'Add daily vital log' })
  addVitalLog(@Param('id') id: string, @Body() dto: CreateVitalLogDto) {
    return this.service.addVitalLog(id, dto);
  }

  @Post('hospitalizations/:id/discharge')
  @ApiOperation({ summary: 'Discharge patient' })
  discharge(@Param('id') id: string, @Body() body: { actualDischargeAt?: string }) {
    return this.service.discharge(id, body?.actualDischargeAt);
  }

  @Delete('hospitalizations/:id')
  @ApiOperation({ summary: 'Delete hospitalization' })
  async softDelete(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}
