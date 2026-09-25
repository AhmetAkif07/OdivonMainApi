import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesRepository } from './branches.repository';
import { BranchesService } from './branches.service';

@Module({
  controllers: [BranchesController],
  providers: [BranchesRepository, BranchesService],
  exports: [BranchesRepository, BranchesService],
})
export class GymBranchesModule {}
