import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseService } from '../firebase/firebase.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly firebase: FirebaseService) {}

  @Get()
  @ApiOperation({ summary: 'Public liveness and Firestore connectivity probe' })
  async health(): Promise<{ status: 'ok' }> {
    await this.firebase.db.listCollections();
    return { status: 'ok' };
  }
}
