import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { levelForCount, RANK_THRESHOLDS } from './rank-thresholds';

export interface RankResult {
  count: number;
  level: number;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.timezone = this.config.get<string>('TIMEZONE') ?? 'Asia/Tashkent';
  }

  levelCount(): number {
    return RANK_THRESHOLDS.length;
  }

  async currentMonth(userId: string): Promise<RankResult> {
    const now = new Date();
    return this.countForRange(userId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1));
  }

  /** Reads the previous month from the MonthlyStat snapshot; falls back to a live count if the cron hasn't run yet. */
  async previousMonth(userId: string): Promise<RankResult | null> {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevMonthDate.getFullYear();
    const month = prevMonthDate.getMonth() + 1;

    const snapshot = await this.prisma.monthlyStat.findUnique({
      where: { userId_year_month: { userId, year, month } },
    });
    if (snapshot) {
      return { count: snapshot.completedCount, level: snapshot.rankLevel };
    }

    const rangeStart = new Date(year, month - 1, 1);
    const rangeEnd = new Date(year, month, 1);
    if (rangeEnd > now) return null;
    return this.countForRange(userId, rangeStart, rangeEnd);
  }

  async yearlyReport(userId: string, year: number) {
    const rows = await this.prisma.monthlyStat.findMany({
      where: { userId, year },
      orderBy: { month: 'asc' },
    });
    const total = rows.reduce((sum, row) => sum + row.completedCount, 0);
    return { rows, total };
  }

  private async countForRange(userId: string, start: Date, end: Date): Promise<RankResult> {
    const count = await this.prisma.task.count({
      where: { userId, status: TaskStatus.DONE, archivedAt: { gte: start, lt: end } },
    });
    return { count, level: levelForCount(count) };
  }

  /** Snapshots every user's just-finished month into MonthlyStat. Runs just after midnight on the 1st, Tashkent time. */
  @Cron('5 0 1 * *', { timeZone: 'Asia/Tashkent' })
  async snapshotPreviousMonthForAllUsers(): Promise<void> {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevMonthDate.getFullYear();
    const month = prevMonthDate.getMonth() + 1;
    const rangeStart = new Date(year, month - 1, 1);
    const rangeEnd = new Date(year, month, 1);

    const users = await this.prisma.user.findMany({ select: { id: true } });
    this.logger.log(`Snapshotting ${year}-${month} for ${users.length} users`);

    for (const { id: userId } of users) {
      const { count } = await this.countForRange(userId, rangeStart, rangeEnd);
      await this.prisma.monthlyStat.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: { userId, year, month, completedCount: count, rankLevel: levelForCount(count) },
        update: { completedCount: count, rankLevel: levelForCount(count) },
      });
    }
  }
}
