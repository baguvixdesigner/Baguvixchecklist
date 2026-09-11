import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { I18nModule } from './i18n/i18n.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { AiModule } from './ai/ai.module';
import { CollectorModule } from './collector/collector.module';
import { GamificationModule } from './gamification/gamification.module';
import { PaymentsModule } from './payments/payments.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    I18nModule,
    UsersModule,
    TasksModule,
    AiModule,
    CollectorModule,
    GamificationModule,
    PaymentsModule,
    TelegramModule,
  ],
})
export class AppModule {}
