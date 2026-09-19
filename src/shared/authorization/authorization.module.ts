import { Global, Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ModuleGuard } from './module.guard';
import { RoleGuard } from './role.guard';

@Global()
@Module({
  providers: [FirebaseAuthGuard, ModuleGuard, RoleGuard],
  exports: [FirebaseAuthGuard, ModuleGuard, RoleGuard],
})
export class AuthorizationModule {}
