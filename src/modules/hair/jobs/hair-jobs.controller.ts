import { timingSafeEqual } from 'crypto';
import { CanActivate, Controller, ExecutionContext, HttpCode, Injectable, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { HairJobsService } from './hair-jobs.service';

export const JOB_SECRET_HEADER = 'x-job-secret';

/**
 * Lets the scheduler in with `X-Job-Secret: <HAIR_JOB_SECRET>`. Without the env var the endpoints
 * stay closed (401 JOB_UNAUTHORIZED); the Worker cron calls the service directly instead.
 */
@Injectable()
export class HairJobSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env['HAIR_JOB_SECRET'];
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const given = request.headers[JOB_SECRET_HEADER];
    if (!secret || typeof given !== 'string' || !sameSecret(given, secret)) {
      throw new AppException(ErrorCode.JOB_UNAUTHORIZED, 'Geçersiz iş anahtarı.');
    }
    return true;
  }
}

function sameSecret(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Scheduler entry points for every hair tenant (no user auth — protected by the job secret). */
@ApiTags('hair-jobs')
@ApiHeader({ name: JOB_SECRET_HEADER, required: true, description: 'HAIR_JOB_SECRET' })
@UseGuards(HairJobSecretGuard)
@Controller('hair/jobs')
export class HairJobsController {
  constructor(private readonly jobs: HairJobsService) {}

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reminders + package expiry for all hair tenants (run hourly)' })
  run() {
    return this.jobs.runAll();
  }

  @Post('reminders')
  @HttpCode(200)
  @ApiOperation({ summary: 'SMS reminders for appointments within each salon’s reminderHoursBefore' })
  reminders() {
    return this.jobs.runReminders();
  }

  @Post('expire-packages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark customer packages past their end date as expired' })
  expirePackages() {
    return this.jobs.runPackageExpiry();
  }
}
