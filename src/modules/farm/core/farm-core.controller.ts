import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { FarmGuards } from '../shared/farm-guards';
import {
  ChangeFarmPlanDto,
  FarmLoginLogsQueryDto,
  QueueFarmMailDto,
  RecordFarmLoginDto,
  UpdateFarmSettingsDto,
} from './farm-core.dto';
import { FarmCoreService } from './farm-core.service';

@ApiTags('farm')
@ApiBearerAuth()
@RequireModule('farm')
@UseGuards(...FarmGuards)
@Controller('farm')
export class FarmCoreController {
  constructor(private readonly core: FarmCoreService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Current farm user, role, farm and subscription (creates missing defaults)',
  })
  me() {
    return this.core.me();
  }

  @Get('settings')
  settings() {
    return this.core.farm();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update farm name and contact details (admin)' })
  updateSettings(@Body() dto: UpdateFarmSettingsDto) {
    return this.core.updateSettings(dto);
  }

  @Get('subscription')
  subscription() {
    return this.core.subscription();
  }

  @Put('subscription/plan')
  @ApiOperation({ summary: 'Change plan; limits and price come from the server catalog (admin)' })
  changePlan(@Body() dto: ChangeFarmPlanDto) {
    return this.core.changePlan(dto);
  }

  @Post('subscription/expire-demo')
  @ApiOperation({ summary: 'Demo account only: mark the trial as expired' })
  expireDemo() {
    return this.core.expireDemoTrial();
  }

  @Post('login-logs')
  @ApiOperation({ summary: 'Record a successful sign-in of the caller' })
  recordLogin(@Body() dto: RecordFarmLoginDto) {
    return this.core.recordLogin(dto);
  }

  @Get('login-logs/:uid')
  loginLogs(@Param('uid') uid: string, @Query() query: FarmLoginLogsQueryDto) {
    return this.core.loginLogs(uid, query.limit);
  }

  @Post('mail')
  @ApiOperation({ summary: 'Queue an e-mail for the SMTP sender (one recipient)' })
  queueMail(@Body() dto: QueueFarmMailDto) {
    return this.core.queueMail(dto);
  }
}
