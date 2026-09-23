import { ErrorCode } from '../../../../shared/errors/error-codes';
import { VaccinesService } from './vaccines.service';

describe('VaccinesService', () => {
  const vaccines = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    collect: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    isUsedBySchedule: jest.fn(),
  };
  const products = { findById: jest.fn(), findByIds: jest.fn().mockResolvedValue(new Map()) };
  const taxes = { findById: jest.fn(), findByIds: jest.fn().mockResolvedValue(new Map()) };
  let service: VaccinesService;

  const medicine = { productId: 'p1', quantity: 1, taxId: 't1' };

  beforeEach(() => {
    jest.resetAllMocks();
    products.findByIds.mockResolvedValue(new Map());
    taxes.findByIds.mockResolvedValue(new Map());
    service = new VaccinesService(vaccines as never, products as never, taxes as never);
  });

  it('creates a protocol when the medicine product and tax exist', async () => {
    products.findById.mockResolvedValue({ id: 'p1' });
    taxes.findById.mockResolvedValue({ id: 't1' });
    vaccines.create.mockResolvedValue({ id: 'v1' });
    await expect(
      service.create({ name: 'Karma', timeDone: 56, renewal: 'yearly', medicines: [medicine] }),
    ).resolves.toMatchObject({ id: 'v1' });
  });

  it('rejects an unknown medicine product', async () => {
    products.findById.mockResolvedValue(null);
    await expect(
      service.create({ name: 'Karma', timeDone: 56, renewal: 'yearly', medicines: [medicine] }),
    ).rejects.toMatchObject({ code: ErrorCode.DEFINITION_INVALID });
    expect(vaccines.create).not.toHaveBeenCalled();
  });

  it('blocks deleting a protocol that is on a patient schedule', async () => {
    vaccines.getByIdOrThrow.mockResolvedValue({ id: 'v1' });
    vaccines.isUsedBySchedule.mockResolvedValue(true);
    await expect(service.softDelete('v1')).rejects.toMatchObject({ code: ErrorCode.DEFINITION_IN_USE });
    expect(vaccines.softDelete).not.toHaveBeenCalled();
  });
});
