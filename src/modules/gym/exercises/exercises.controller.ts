import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateExerciseDto, ExerciseQueryDto, UpdateExerciseDto } from './exercise.dto';
import { GymExercisesService } from './exercises.service';

@ApiTags('gym-exercises')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/exercises')
export class GymExercisesController {
  constructor(private readonly exercises: GymExercisesService) {}

  @Get()
  @RequirePermission('workouts', 'view')
  list(@Query() query: ExerciseQueryDto) {
    return this.exercises.listForStaff(query);
  }

  @Get(':id')
  @RequirePermission('workouts', 'view')
  get(@Param('id') id: string) {
    return this.exercises.get(id);
  }

  @Post()
  @RequirePermission('workouts', 'create')
  create(@Body() dto: CreateExerciseDto) {
    return this.exercises.createForGym(dto);
  }

  @Patch(':id')
  @RequirePermission('workouts', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateExerciseDto) {
    return this.exercises.updateForGym(id, dto);
  }

  @Delete(':id')
  @RequirePermission('workouts', 'delete')
  remove(@Param('id') id: string) {
    return this.exercises.removeForGym(id);
  }
}
