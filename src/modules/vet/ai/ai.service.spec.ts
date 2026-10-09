import { VetAiService } from './ai.service';

describe('VetAiService', () => {
  let service: VetAiService;

  beforeEach(() => {
    service = new VetAiService();
  });

  it('should calculate amoxicillin dosage for a cat', async () => {
    const res = await service.calculateDosage({
      drug: 'Amoxicillin',
      weight: 4.0,
      species: 'kedi',
    });
    expect(res).toBeDefined();
    expect(res.dosageCard).toBeDefined();
    expect(res.dosageCard?.totalDoseMg).toBe(60); // 4kg * 15 mg/kg
    expect(res.dosageCard?.volumeMl).toBeGreaterThan(0);
  });

  it('should flag paracetamol as toxic for a cat', async () => {
    const res = await service.calculateDosage({
      drug: 'Parasetamol',
      weight: 4.0,
      species: 'kedi',
    });
    expect(res.message).toContain('ÖLÜMCÜL TOKSİSİTE');
    expect(res.dosageCard).toBeUndefined();
  });

  it('should respond to clinical triage query', async () => {
    const res = await service.chat({
      message: 'Kusma ve ishal şikayeti var',
    });
    expect(res.message).toContain('Gastroenterit');
    expect(res.suggestedActions?.length).toBeGreaterThan(0);
  });
});
