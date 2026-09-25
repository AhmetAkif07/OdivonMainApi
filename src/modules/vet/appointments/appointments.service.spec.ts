import { rangesOverlap, reservationSlotIds } from './reservation-slots';
import { AppointmentsService } from './appointments.service';
import { ErrorCode } from '../../../shared/errors/error-codes';

describe('reservationSlotIds', () => {
  it('encodes exclusive end so 14:00-15:00 and 15:00-16:00 do not share slots', () => {
    const doctor = 'doc-1';
    const a = reservationSlotIds(
      doctor,
      new Date('2026-01-01T14:00:00.000Z'),
      new Date('2026-01-01T15:00:00.000Z'),
    );
    const b = reservationSlotIds(
      doctor,
      new Date('2026-01-01T15:00:00.000Z'),
      new Date('2026-01-01T16:00:00.000Z'),
    );
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('shares slots for overlapping 14:00-15:00 and 14:30-15:30', () => {
    const doctor = 'doc-1';
    const a = reservationSlotIds(
      doctor,
      new Date('2026-01-01T14:00:00.000Z'),
      new Date('2026-01-01T15:00:00.000Z'),
    );
    const b = reservationSlotIds(
      doctor,
      new Date('2026-01-01T14:30:00.000Z'),
      new Date('2026-01-01T15:30:00.000Z'),
    );
    expect(a.some((id) => b.includes(id))).toBe(true);
    expect(
      rangesOverlap(
        new Date('2026-01-01T14:00:00.000Z'),
        new Date('2026-01-01T15:00:00.000Z'),
        new Date('2026-01-01T14:30:00.000Z'),
        new Date('2026-01-01T15:30:00.000Z'),
      ),
    ).toBe(true);
  });

  it('does not share slots across different doctors', () => {
    const a = reservationSlotIds(
      'doc-a',
      new Date('2026-01-01T14:00:00.000Z'),
      new Date('2026-01-01T15:00:00.000Z'),
    );
    const b = reservationSlotIds(
      'doc-b',
      new Date('2026-01-01T14:00:00.000Z'),
      new Date('2026-01-01T15:00:00.000Z'),
    );
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});

describe('atomic slot reservation (concurrent creates)', () => {
  it('allows only one overlapping reservation when two creates race', async () => {
    const slots = new Set<string>();
    let chain = Promise.resolve();

    const reserveAtomic = async (ids: string[]): Promise<boolean> => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        if (ids.some((id) => slots.has(id))) {
          return false;
        }
        await Promise.resolve();
        ids.forEach((id) => slots.add(id));
        return true;
      } finally {
        release();
      }
    };

    const a = reservationSlotIds(
      'doc-1',
      new Date('2026-01-01T14:00:00.000Z'),
      new Date('2026-01-01T15:00:00.000Z'),
    );
    const b = reservationSlotIds(
      'doc-1',
      new Date('2026-01-01T14:30:00.000Z'),
      new Date('2026-01-01T15:30:00.000Z'),
    );

    const results = await Promise.all([reserveAtomic(a), reserveAtomic(b)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('AppointmentsService relationship validation', () => {
  const appointments = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    complete: jest.fn(),
    softDelete: jest.fn(),
    list: jest.fn(),
  };
  const customers = { findById: jest.fn() };
  const patients = { findById: jest.fn() };
  const products = { findById: jest.fn() };
  const sales = { create: jest.fn(), findByIds: jest.fn() };
  let service: AppointmentsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AppointmentsService(
      appointments as never,
      customers as never,
      patients as never,
      products as never,
      sales as never,
    );
  });

  it('creates when customer and patient match in the current tenant', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.findById.mockResolvedValue({ id: 'p1', customerId: 'c1' });
    appointments.create.mockResolvedValue({ id: 'a1' });
    await expect(
      service.create({
        beginAt: '2026-01-01T14:00:00.000Z',
        endAt: '2026-01-01T15:00:00.000Z',
        customerId: 'c1',
        patientId: 'p1',
        doctorId: 'doc-1',
        type: 'checkup',
      }),
    ).resolves.toMatchObject({ id: 'a1' });
  });

  it('rejects when patient belongs to a different customer', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.findById.mockResolvedValue({ id: 'p1', customerId: 'c2' });
    await expect(
      service.create({
        beginAt: '2026-01-01T14:00:00.000Z',
        endAt: '2026-01-01T15:00:00.000Z',
        customerId: 'c1',
        patientId: 'p1',
        doctorId: 'doc-1',
        type: 'checkup',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.APPOINTMENT_INVALID });
  });

  it('updates status', async () => {
    appointments.updateStatus.mockResolvedValue({ id: 'a1', status: 'completed' });
    await expect(service.updateStatus('a1', 'completed')).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('completes without a sale when there are no lines', async () => {
    appointments.getByIdOrThrow.mockResolvedValue({
      id: 'a1',
      status: 'scheduled',
      saleId: null,
      customerId: 'c1',
      note: null,
    });
    appointments.complete.mockResolvedValue({ id: 'a1', status: 'completed', saleId: null });
    await expect(service.complete('a1', {})).resolves.toMatchObject({ status: 'completed', saleId: null });
    expect(sales.create).not.toHaveBeenCalled();
    expect(appointments.complete).toHaveBeenCalledWith('a1', null);
  });

  it('creates a sale with product prices when completing with lines', async () => {
    appointments.getByIdOrThrow.mockResolvedValue({
      id: 'a1',
      status: 'scheduled',
      saleId: null,
      customerId: 'c1',
      note: 'kontrol',
    });
    products.findById.mockResolvedValue({
      id: 'p1',
      sellingPrice: 150,
      taxId: 't1',
      vatIncluded: true,
    });
    sales.create.mockResolvedValue({ id: 's1' });
    appointments.complete.mockResolvedValue({ id: 'a1', status: 'completed', saleId: 's1' });
    await expect(
      service.complete('a1', { lines: [{ productId: 'p1', quantity: 2 }] }),
    ).resolves.toMatchObject({ saleId: 's1' });
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sale',
        customerId: 'c1',
        appointmentId: 'a1',
        lines: [
          expect.objectContaining({
            productId: 'p1',
            quantity: 2,
            unitPrice: 150,
            taxId: 't1',
            vatIncluded: true,
          }),
        ],
      }),
    );
    expect(appointments.complete).toHaveBeenCalledWith('a1', 's1');
  });

  it('rejects completing an appointment that is not scheduled', async () => {
    appointments.getByIdOrThrow.mockResolvedValue({ id: 'a1', status: 'completed', saleId: null });
    await expect(service.complete('a1', { lines: [] })).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATUS,
    });
  });

  it('rejects a second complete when a sale already exists', async () => {
    appointments.getByIdOrThrow.mockResolvedValue({ id: 'a1', status: 'scheduled', saleId: 's1' });
    await expect(service.complete('a1', { lines: [] })).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATUS,
    });
  });
});
