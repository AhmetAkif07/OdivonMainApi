import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { AiChatRequestDto, CalculateDosageDto } from './ai.dto';
import { VetAiService } from './ai.service';

@ApiTags('vet-ai')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard)
@Controller('vet/ai')
export class VetAiController {
  constructor(private readonly service: VetAiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Clinical AI assistant chat & copilot' })
  chat(@Body() dto: AiChatRequestDto) {
    return this.service.chat(dto);
  }

  @Post('dosage-calculate')
  @ApiOperation({ summary: 'Calculate accurate veterinary drug dosage' })
  calculateDosage(@Body() dto: CalculateDosageDto) {
    return this.service.calculateDosage(dto);
  }
}
