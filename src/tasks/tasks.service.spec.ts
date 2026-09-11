import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';

function makePrisma() {
  return {
    task: { count: jest.fn() },
  };
}

describe('TasksService.stats', () => {
  it('reports open, closedTotal, and this-month created/closed counts', async () => {
    const prisma = makePrisma();
    prisma.task.count
      .mockResolvedValueOnce(5) // open
      .mockResolvedValueOnce(40) // closedTotal
      .mockResolvedValueOnce(12) // createdThisMonth
      .mockResolvedValueOnce(9); // closedThisMonth
    const service = new TasksService(prisma as any);

    const result = await service.stats('user-1');

    expect(result).toEqual({ open: 5, closedTotal: 40, createdThisMonth: 12, closedThisMonth: 9 });
  });

  it('scopes every count to the given user', async () => {
    const prisma = makePrisma();
    prisma.task.count.mockResolvedValue(0);
    const service = new TasksService(prisma as any);

    await service.stats('user-42');

    for (const call of prisma.task.count.mock.calls) {
      expect(call[0].where.userId).toBe('user-42');
    }
  });

  it('open count only includes ACTIVE tasks', async () => {
    const prisma = makePrisma();
    prisma.task.count.mockResolvedValue(0);
    const service = new TasksService(prisma as any);

    await service.stats('user-1');

    expect(prisma.task.count.mock.calls[0][0].where.status).toBe(TaskStatus.ACTIVE);
  });

  it('closedTotal counts both DONE and CANCELLED regardless of when they were created', async () => {
    const prisma = makePrisma();
    prisma.task.count.mockResolvedValue(0);
    const service = new TasksService(prisma as any);

    await service.stats('user-1');

    const closedTotalWhere = prisma.task.count.mock.calls[1][0].where;
    expect(closedTotalWhere.status.in).toEqual(expect.arrayContaining([TaskStatus.DONE, TaskStatus.CANCELLED]));
    expect(closedTotalWhere.createdAt).toBeUndefined();
  });
});
