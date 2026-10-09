import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { ErrorLogService } from '../errors/error-log.service';

@Global()
@Module({
  providers: [FirebaseService, ErrorLogService],
  exports: [FirebaseService, ErrorLogService],
})
export class FirebaseModule {}
