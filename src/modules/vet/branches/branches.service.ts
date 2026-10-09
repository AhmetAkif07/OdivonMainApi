import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVetBranchDto, UpdateVetBranchDto } from './branch.dto';
import { BranchesRepository } from './branches.repository';
import { VetBranch } from './branch.entity';

@Injectable()
export class BranchesService {
  constructor(private readonly repo: BranchesRepository) {}

  async list(): Promise<VetBranch[]> {
    const list = await this.repo.list();
    if (list.length === 0) {
      // Auto-create default primary branch if empty
      const defaultBranch = await this.repo.create({
        name: 'Merkez Klinik Şubesi',
        code: 'MRK-01',
        isMain: true,
        phone: '0212 555 0100',
        city: 'İstanbul',
        district: 'Merkez',
        address: 'Merkez Mah. Klinik Cad. No: 1',
        status: 'active',
        color: '#6366f1',
      });
      return [defaultBranch];
    }
    return list;
  }

  async get(id: string): Promise<VetBranch> {
    const item = await this.repo.getById(id);
    if (!item) throw new NotFoundException('Şube bulunamadı');
    return item;
  }

  create(dto: CreateVetBranchDto) {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateVetBranchDto) {
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException('Şube bulunamadı');
    return updated;
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
