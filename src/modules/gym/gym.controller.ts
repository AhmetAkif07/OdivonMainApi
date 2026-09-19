import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';

@ApiTags('gym')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('gym')
export class GymController {
  @Get('health')
  @ApiOperation({ summary: 'Gym module placeholder — not implemented yet' })
  health(): never {
    throw new AppException(ErrorCode.NOT_IMPLEMENTED, 'Gym module is not implemented yet');
  }
}
