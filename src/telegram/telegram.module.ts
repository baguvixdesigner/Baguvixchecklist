import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';

import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiModule } from '../ai/ai.module';
import { CollectorModule } from '../collector/collector.module';
import { GamificationModule } from '../gamification/gamification.module';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
      }),
    }),
    UsersModule,
    TasksModule,
    AiModule,
    CollectorModule,
    GamificationModule,
  ],
  providers: [TelegramUpdate],
})
export class TelegramModule {}
