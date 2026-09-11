import { ConfigService } from '@nestjs/config';
import { TaskStatus } from '@prisma/client';
import { GamificationService } from './gamification.service';
import { levelForCount } from './rank-thresholds';

function makePrisma() {
  return {
    task: { count: jest.fn() },
    monthlyStat: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    user: { findMany: jest.fn() },
  };
}

const config = { get: () => undefined } as unknown as ConfigService;

describe('GamificationService', () => {
  it('currentMonth counts DONE tasks archived within the current calendar month', async () => {
    const prisma = makePrisma();
    prisma.task.count.mockResolvedValue(17);
    const service = new GamificationService(prisma as any, config);

    const result = await service.currentMonth('user-1');

    expect(result).toEqual({ count: 17, level: levelForCount(17) });
    const where = prisma.task.count.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.status).toBe(TaskStatus.DONE);
    expect(where.archivedAt.gte.getDate()).toBe(1);
  });

  it('previousMonth reads from the MonthlyStat snapshot when one exists', async () => {
    const prisma = makePrisma();
    prisma.monthlyStat.findUnique.mockResolvedValue({ completedCount: 42, rankLevel: 5 });
    const service = new GamificationService(prisma as any, config);

    const result = await service.previousMonth('user-1');

    expect(result).toEqual({ count: 42, level: 5 });
    expect(prisma.task.count).not.toHaveBeenCalled();
  });

  it('previousMonth falls back to a live count when no snapshot exists yet', async () => {
    const prisma = makePrisma();
    prisma.monthlyStat.findUnique.mockResolvedValue(null);
    prisma.task.count.mockResolvedValue(8);
    const service = new GamificationService(prisma as any, config);

    const result = await service.previousMonth('user-1');

    expect(result).toEqual({ count: 8, level: levelForCount(8) });
  });

  it('yearlyReport sums completedCount across the snapshot rows', async () => {
    const prisma = makePrisma();
    prisma.monthlyStat.findMany.mockResolvedValue([
      { month: 1, completedCount: 10, rankLevel: 2 },
      { month: 2, completedCount: 20, rankLevel: 3 },
    ]);
    const service = new GamificationService(prisma as any, config);

    const result = await service.yearlyReport('user-1', 2025);

    expect(result.total).toBe(30);
    expect(result.rows).toHaveLength(2);
    expect(prisma.monthlyStat.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', year: 2025 },
      orderBy: { month: 'asc' },
    });
  });

  it('yearlyReport returns zero total for a year with no snapshots', async () => {
    const prisma = makePrisma();
    prisma.monthlyStat.findMany.mockResolvedValue([]);
    const service = new GamificationService(prisma as any, config);

    const result = await service.yearlyReport('user-1', 2020);

    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('snapshotPreviousMonthForAllUsers upserts a MonthlyStat row per user', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    prisma.task.count.mockResolvedValueOnce(3).mockResolvedValueOnce(120);
    const service = new GamificationService(prisma as any, config);

    await service.snapshotPreviousMonthForAllUsers();

    expect(prisma.monthlyStat.upsert).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = prisma.monthlyStat.upsert.mock.calls;
    expect(firstCall[0].create).toMatchObject({ userId: 'user-1', completedCount: 3, rankLevel: levelForCount(3) });
    expect(secondCall[0].create).toMatchObject({ userId: 'user-2', completedCount: 120, rankLevel: levelForCount(120) });
  });
});
