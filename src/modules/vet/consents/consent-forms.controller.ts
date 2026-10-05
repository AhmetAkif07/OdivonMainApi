import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { ConsentFormsService } from './consent-forms.service';
import { CreateConsentFormDto } from './dto/create-consent-form.dto';
import { ListConsentFormsQueryDto } from './dto/list-consent-forms.query.dto';
import { UpdateConsentFormDto } from './dto/update-consent-form.dto';

@ApiTags('vet-consents')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/consents')
export class ConsentFormsController {
  constructor(private readonly service: ConsentFormsService) {}

  @Get()
  @RequirePermission('consentForms', 'view')
  @ApiOperation({ summary: 'List digital consent forms' })
  list(@Query() query: ListConsentFormsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('consentForms', 'create')
  @ApiOperation({ summary: 'Create and sign a digital consent form' })
  create(@Body() dto: CreateConsentFormDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('consentForms', 'view')
  @ApiOperation({ summary: 'Get a digital consent form' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('consentForms', 'update')
  @ApiOperation({ summary: 'Update consent form status or doctor notes' })
  update(@Param('id') id: string, @Body() dto: UpdateConsentFormDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('consentForms', 'delete')
  @ApiOperation({ summary: 'Soft-delete a consent form' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}
