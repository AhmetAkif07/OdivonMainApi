import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateExaminationDto } from './dto/create-examination.dto';
import { ListExaminationsQueryDto } from './dto/list-examinations.query.dto';
import { UpdateExaminationDto } from './dto/update-examination.dto';
import { ExaminationsService } from './examinations.service';

@ApiTags('vet-examinations')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/examinations')
export class ExaminationsController {
  constructor(private readonly examinations: ExaminationsService) {}

  @Get()
  @ApiOperation({ summary: 'List examinations in the current tenant' })
  list(@Query() query: ListExaminationsQueryDto) {
    return this.examinations.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an examination' })
  create(@Body() dto: CreateExaminationDto) {
    return this.examinations.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get examination by id' })
  get(@Param('id') id: string) {
    return this.examinations.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an examination' })
  update(@Param('id') id: string, @Body() dto: UpdateExaminationDto) {
    return this.examinations.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an examination' })
  async remove(@Param('id') id: string) {
    await this.examinations.softDelete(id);
    return { id };
  }
}
