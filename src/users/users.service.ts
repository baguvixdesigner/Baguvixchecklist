import { Injectable } from '@nestjs/common';
import { Language, User, UserState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTelegramId(telegramId: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  async getOrCreate(telegramId: number, username?: string, firstName?: string): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.findByTelegramId(telegramId);
    if (existing) {
      return { user: existing, isNew: false };
    }
    const user = await this.prisma.user.create({
      data: { telegramId: BigInt(telegramId), username, firstName, state: UserState.AWAITING_LANGUAGE },
    });
    return { user, isNew: true };
  }

  async setLanguage(userId: string, language: Language): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { language, state: UserState.IDLE } });
  }

  async setState(userId: string, state: UserState, pendingTaskId?: string | null): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { state, pendingTaskId: pendingTaskId === undefined ? undefined : pendingTaskId },
    });
  }
}
