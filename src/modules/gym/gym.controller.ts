import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';

@ApiTags('gym')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard)
@Controller('gym')
export class GymController {
  @Get('health')
  @ApiOperation({ summary: 'Gym module liveness' })
  health() {
    return { status: 'ok', module: 'gym' };
  }
}
