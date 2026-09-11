import { Injectable } from '@nestjs/common';
import { Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredTask } from '../ai/ai.service';

export interface CreateTaskInput {
  userId: string;
  fromWhom: string;
  structured: StructuredTask;
  originalText?: string;
  imageFileId?: string;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateTaskInput): Promise<Task> {
    return this.prisma.task.create({
      data: {
        userId: input.userId,
        fromWhom: input.fromWhom,
        deadlineRaw: input.structured.deadlineRaw,
        description: input.structured.description,
        originalText: input.originalText,
        imageFileId: input.imageFileId,
      },
    });
  }

  getById(taskId: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id: taskId } });
  }

  linkCard(taskId: string, cardChatId: number, cardMessageId: number): Promise<Task> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { cardChatId: BigInt(cardChatId), cardMessageId },
    });
  }

  applyEdit(taskId: string, structured: StructuredTask): Promise<Task> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { deadlineRaw: structured.deadlineRaw, description: structured.description },
    });
  }

  setSender(taskId: string, fromWhom: string): Promise<Task> {
    return this.prisma.task.update({ where: { id: taskId }, data: { fromWhom } });
  }

  archive(taskId: string, status: typeof TaskStatus.DONE | typeof TaskStatus.CANCELLED): Promise<Task> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { status, archivedAt: new Date() },
    });
  }

  async stats(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [open, closedTotal, createdThisMonth, closedThisMonth] = await Promise.all([
      this.prisma.task.count({ where: { userId, status: TaskStatus.ACTIVE } }),
      this.prisma.task.count({ where: { userId, status: { in: [TaskStatus.DONE, TaskStatus.CANCELLED] } } }),
      this.prisma.task.count({ where: { userId, createdAt: { gte: monthStart } } }),
      this.prisma.task.count({
        where: { userId, createdAt: { gte: monthStart }, status: { in: [TaskStatus.DONE, TaskStatus.CANCELLED] } },
      }),
    ]);

    return { open, closedTotal, createdThisMonth, closedThisMonth };
  }
}
