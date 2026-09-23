import { Global, Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ModuleGuard } from './module.guard';
import { PermissionGuard } from './permission.guard';
import { RoleGuard } from './role.guard';

@Global()
@Module({
  providers: [FirebaseAuthGuard, ModuleGuard, RoleGuard, PermissionGuard],
  exports: [FirebaseAuthGuard, ModuleGuard, RoleGuard, PermissionGuard],
})
export class AuthorizationModule {}
