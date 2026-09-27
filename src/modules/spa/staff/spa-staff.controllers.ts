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
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SpaStaffService } from './spa-staff.service';
import {
  CreateSpaLeaveDto,
  CreateSpaTaskDto,
  InviteSpaStaffDto,
  SetSpaStaffRoleDto,
  UpdateSpaLeaveDto,
  UpdateSpaStaffDto,
  UpdateSpaTaskDto,
} from './staff.dto';

@ApiTags('spa-staff')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/staff')
export class SpaStaffController {
  constructor(private readonly staff: SpaStaffService) {}

  @Get()
  @RequirePermission('spaStaff', 'view')
  list() {
    return this.staff.list();
  }

  @Get(':id')
  @RequirePermission('spaStaff', 'view')
  get(@Param('id') id: string) {
    return this.staff.get(id);
  }

  @Patch(':id')
  @RequirePermission('spaStaff', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaStaffDto) {
    return this.staff.updateProfile(id, dto);
  }

  @Post('invite')
  @RequirePermission('spaStaff', 'create')
  @ApiOperation({ summary: 'Create a staff login and return a password-reset link to share' })
  invite(@Body() dto: InviteSpaStaffDto) {
    return this.staff.invite(dto);
  }

  @Patch(':id/role')
  @RequirePermission('spaStaff', 'update')
  setRole(@Param('id') id: string, @Body() dto: SetSpaStaffRoleDto) {
    return this.staff.setRole(id, dto.role);
  }

  @Post(':id/deactivate')
  @RequirePermission('spaStaff', 'delete')
  deactivate(@Param('id') id: string) {
    return this.staff.deactivate(id);
  }
}

@ApiTags('spa-staff')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/leaves')
export class SpaLeavesController {
  constructor(private readonly staff: SpaStaffService) {}

  @Get()
  @RequirePermission('spaLeaves', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.staff.listLeaves(query.staffId, query.limit);
  }

  @Post()
  @RequirePermission('spaLeaves', 'create')
  create(@Body() dto: CreateSpaLeaveDto) {
    return this.staff.createLeave(dto);
  }

  @Patch(':id')
  @RequirePermission('spaLeaves', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaLeaveDto) {
    return this.staff.updateLeave(id, dto);
  }

  @Delete(':id')
  @RequirePermission('spaLeaves', 'delete')
  remove(@Param('id') id: string) {
    return this.staff.removeLeave(id);
  }
}

@ApiTags('spa-staff')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/tasks')
export class SpaTasksController {
  constructor(private readonly staff: SpaStaffService) {}

  @Get()
  @RequirePermission('spaTasks', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.staff.listTasks(query.staffId, query.limit);
  }

  @Post()
  @RequirePermission('spaTasks', 'create')
  create(@Body() dto: CreateSpaTaskDto) {
    return this.staff.createTask(dto);
  }

  @Patch(':id')
  @RequirePermission('spaTasks', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaTaskDto) {
    return this.staff.updateTask(id, dto);
  }

  @Delete(':id')
  @RequirePermission('spaTasks', 'delete')
  remove(@Param('id') id: string) {
    return this.staff.removeTask(id);
  }
}
