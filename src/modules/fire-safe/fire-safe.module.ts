import { Module } from '@nestjs/common';
import { FireSafeController } from './fire-safe.controller';
import { FireSafeRepository } from './fire-safe.repository';
import { FireSafeService } from './fire-safe.service';

@Module({ controllers: [FireSafeController], providers: [FireSafeService, FireSafeRepository], exports: [FireSafeService] })
export class FireSafeModule {}
