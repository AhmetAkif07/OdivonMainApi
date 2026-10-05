import { PetHotelService } from './pet-hotel.service';

describe('PetHotelService', () => {
  let service: PetHotelService;
  let roomsRepo: any;
  let staysRepo: any;
  let logsRepo: any;
  let customersRepo: any;
  let patientsRepo: any;

  beforeEach(() => {
    roomsRepo = {
      list: jest.fn(),
      getByIdOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateStatus: jest.fn(),
      getAll: jest.fn().mockResolvedValue([
        { id: 'room-1', name: 'Süit 101', type: 'suite', status: 'available', dailyRate: 500 },
        { id: 'room-2', name: 'Oda 102', type: 'standard', status: 'occupied', dailyRate: 400 },
      ]),
    };
    staysRepo = {
      list: jest.fn(),
      getByIdOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn().mockResolvedValue([
        { id: 'stay-1', roomId: 'room-2', patientName: 'Pamuk', status: 'checked_in', startDate: '2026-10-05', endDate: '2026-10-08', totalDays: 3, dailyRate: 400, totalAmount: 1200 },
      ]),
    };
    logsRepo = {
      list: jest.fn(),
      getByIdOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    customersRepo = {
      getByIdOrThrow: jest.fn().mockResolvedValue({ id: 'c-1', firstName: 'Ahmet', lastName: 'Yılmaz', phone: '05551112233' }),
    };
    patientsRepo = {
      getByIdOrThrow: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Pamuk', animalType: 'Kedi', breed: 'British Shorthair' }),
    };

    service = new PetHotelService(roomsRepo, staysRepo, logsRepo, customersRepo, patientsRepo);
  });

  it('calculates total days and cost on creating stay', async () => {
    roomsRepo.getByIdOrThrow.mockResolvedValue({ id: 'room-1', name: 'Süit 101', type: 'suite', dailyRate: 500 });
    staysRepo.create.mockImplementation((data: any) => Promise.resolve({ ...data, id: 'stay-created' }));

    const result = await service.createStay({
      roomId: 'room-1',
      customerId: 'c-1',
      patientId: 'p-1',
      startDate: '2026-10-05',
      endDate: '2026-10-08',
      extraServicesAmount: 150,
    });

    expect(result.totalDays).toBe(3);
    expect(result.dailyRate).toBe(500);
    expect(result.totalAmount).toBe(3 * 500 + 150);
    expect(staysRepo.create).toHaveBeenCalled();
  });

  it('returns board summary with occupancy stats', async () => {
    const summary = await service.getBoardSummary();
    expect(summary.totalRooms).toBe(2);
    expect(summary.availableCount).toBe(1);
    expect(summary.occupiedCount).toBe(1);
    expect(summary.rooms[1].currentStay?.patientName).toBe('Pamuk');
  });
});
