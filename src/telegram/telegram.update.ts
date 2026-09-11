import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Action, Ctx, InjectBot, On, Start, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { Language, Task, User, UserState } from '@prisma/client';

import { UsersService } from '../users/users.service';
import { TasksService } from '../tasks/tasks.service';
import { AiService, AiImageInput, StructuredTask } from '../ai/ai.service';
import { toClaudeMediaType } from '../ai/claude-media-type';
import { I18nService } from '../i18n/i18n.service';
import { CollectedItem, CollectedPhotoItem, CollectorService } from '../collector/collector.service';
import { GamificationService } from '../gamification/gamification.service';
import { cardInlineKeyboard, languageInlineKeyboard, mainMenuKeyboard } from './keyboards';
import { buildCardText } from './card.util';
import { extractForwardSenderName, isForwardedMessage } from './forward-sender';

const LANGUAGE_CHOICE_PROMPT = 'Выбери язык интерфейса / Tilni tanlang / Choose language:';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);
  private readonly originalMessageDeleteDelayMs: number;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly ai: AiService,
    private readonly i18n: I18nService,
    private readonly collector: CollectorService,
    private readonly gamification: GamificationService,
    private readonly config: ConfigService,
  ) {
    this.originalMessageDeleteDelayMs = Number(this.config.get('ORIGINAL_MESSAGE_DELETE_DELAY_MS') ?? 120000);
  }

  @Start()
  async onStart(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    const { user, isNew } = await this.users.getOrCreate(ctx.from.id, ctx.from.username, ctx.from.first_name);

    if (isNew || user.state === UserState.AWAITING_LANGUAGE) {
      await ctx.reply(LANGUAGE_CHOICE_PROMPT, languageInlineKeyboard());
      return;
    }

    await this.sendHelp(ctx, user.language);
  }

  @Action(/^lang:(ru|uz|en)$/)
  async onLanguageChosen(@Ctx() ctx: Context) {
    if (!ctx.from || !('match' in ctx)) return;
    const lang = (ctx as unknown as { match: RegExpMatchArray }).match[1] as Language;

    const existing = await this.users.findByTelegramId(ctx.from.id);
    if (!existing) return;
    const wasOnboarding = existing.state === UserState.AWAITING_LANGUAGE;

    await this.users.setLanguage(existing.id, lang);
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply(this.i18n.t(lang, 'language.changed'));

    if (wasOnboarding) {
      await this.sendHelp(ctx, lang);
    } else {
      await ctx.reply('.', { reply_markup: mainMenuKeyboard(this.i18n, lang).reply_markup }).catch(() => undefined);
    }
  }

  @Action(/^task:(done|cancel):(.+)$/)
  async onTaskArchive(@Ctx() ctx: Context) {
    if (!ctx.from || !('match' in ctx)) return;
    const [, action, taskId] = (ctx as unknown as { match: RegExpMatchArray }).match;
    const user = await this.users.findByTelegramId(ctx.from.id);
    if (!user) return;
    const lang = user.language;

    const task = await this.tasks.getById(taskId);
    if (!task || task.userId !== user.id) {
      await ctx.answerCbQuery(this.i18n.t(lang, 'actions.notFound'), { show_alert: true }).catch(() => undefined);
      return;
    }

    const status = action === 'done' ? 'DONE' : 'CANCELLED';
    await this.tasks.archive(taskId, status);
    await ctx.answerCbQuery(this.i18n.t(lang, action === 'done' ? 'actions.done' : 'actions.cancelled')).catch(() => undefined);
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  }

  @Action(/^task:edit:(.+)$/)
  async onTaskEditRequested(@Ctx() ctx: Context) {
    if (!ctx.from || !('match' in ctx)) return;
    const [, taskId] = (ctx as unknown as { match: RegExpMatchArray }).match;
    const user = await this.users.findByTelegramId(ctx.from.id);
    if (!user) return;
    const lang = user.language;

    const task = await this.tasks.getById(taskId);
    if (!task || task.userId !== user.id) {
      await ctx.answerCbQuery(this.i18n.t(lang, 'actions.notFound'), { show_alert: true }).catch(() => undefined);
      return;
    }

    await this.users.setState(user.id, UserState.AWAITING_EDIT, taskId);
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx.reply(this.i18n.t(lang, 'edit.prompt'));
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const user = await this.users.findByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('/start');
      return;
    }
    const lang = user.language;

    const menuKey = this.i18n.findKeyByValue('menu', text);
    if (menuKey) {
      await this.handleMenu(ctx, user, menuKey);
      return;
    }

    if (user.state === UserState.AWAITING_SENDER_NAME && user.pendingTaskId) {
      await this.tasks.setSender(user.pendingTaskId, text);
      await this.users.setState(user.id, UserState.IDLE, null);
      await ctx.reply(this.i18n.t(lang, 'senderName.saved'));
      await this.refreshCard(ctx, user.pendingTaskId, lang);
      return;
    }

    if (user.state === UserState.AWAITING_EDIT && user.pendingTaskId) {
      await this.applyEdit(ctx, user, user.pendingTaskId, text);
      return;
    }

    const forwarded = isForwardedMessage(ctx.message);
    if (forwarded) {
      const fromWhom = extractForwardSenderName(ctx.message);
      this.collector.push(
        this.chatKey(ctx),
        { type: 'text', text, messageId: ctx.message.message_id },
        (items) => this.finalizeCollection(ctx, user, items, fromWhom),
      );
      return;
    }

    if (user.state === UserState.AWAITING_NEW_TASK) {
      this.collector.push(
        this.chatKey(ctx),
        { type: 'text', text, messageId: ctx.message.message_id },
        (items) => this.finalizeCollection(ctx, user, items, this.i18n.t(lang, 'newTask.defaultSender')),
      );
    }
  }

  @On('photo')
  async onPhoto(@Ctx() ctx: Context) {
    if (!ctx.from || !ctx.message || !('photo' in ctx.message)) return;
    const user = await this.users.findByTelegramId(ctx.from.id);
    if (!user) return;

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    await this.collectPhotoLikeItem(ctx, ctx.message, user, {
      type: 'photo',
      fileId,
      mediaGroupId: ctx.message.media_group_id,
      caption: ctx.message.caption,
      messageId: ctx.message.message_id,
    });
  }

  // Telegram sends an image as a "document" (not "photo") when it's forwarded
  // uncompressed or sent via the file picker — treat it the same as a photo.
  @On('document')
  async onDocument(@Ctx() ctx: Context) {
    if (!ctx.from || !ctx.message || !('document' in ctx.message)) return;
    const document = ctx.message.document;
    if (!document.mime_type?.startsWith('image/')) return;

    const user = await this.users.findByTelegramId(ctx.from.id);
    if (!user) return;

    await this.collectPhotoLikeItem(ctx, ctx.message, user, {
      type: 'photo',
      fileId: document.file_id,
      mediaGroupId: ctx.message.media_group_id,
      caption: ctx.message.caption,
      messageId: ctx.message.message_id,
      mimeType: document.mime_type,
    });
  }

  private async collectPhotoLikeItem(ctx: Context, message: Message, user: User, item: CollectedPhotoItem) {
    const lang = user.language;
    const forwarded = isForwardedMessage(message);
    if (forwarded) {
      const fromWhom = extractForwardSenderName(message);
      this.collector.push(this.chatKey(ctx), item, (items) => this.finalizeCollection(ctx, user, items, fromWhom));
      return;
    }

    if (user.state === UserState.AWAITING_NEW_TASK) {
      this.collector.push(this.chatKey(ctx), item, (items) =>
        this.finalizeCollection(ctx, user, items, this.i18n.t(lang, 'newTask.defaultSender')),
      );
    }
  }

  private async handleMenu(ctx: Context, user: User, menuKey: string) {
    const lang = user.language;
    switch (menuKey) {
      case 'newTask':
        await this.users.setState(user.id, UserState.AWAITING_NEW_TASK, null);
        await ctx.reply(this.i18n.t(lang, 'newTask.waiting'));
        return;
      case 'report':
        await this.sendReport(ctx, user);
        return;
      case 'stats':
        await this.sendStats(ctx, user);
        return;
      case 'settings':
        await ctx.reply(this.i18n.t(lang, 'settings.chooseLanguage'), languageInlineKeyboard());
        return;
      case 'help':
        await this.sendHelp(ctx, lang);
        return;
    }
  }

  private async sendHelp(ctx: Context, lang: Language) {
    await ctx.reply(this.i18n.t(lang, 'help.text'), { parse_mode: 'Markdown', ...mainMenuKeyboard(this.i18n, lang) });
  }

  private async sendStats(ctx: Context, user: User) {
    const lang = user.language;
    const stats = await this.tasks.stats(user.id);
    const message = [
      this.i18n.t(lang, 'stats.title'),
      this.i18n.t(lang, 'stats.open', { open: stats.open }),
      this.i18n.t(lang, 'stats.closedTotal', { closedTotal: stats.closedTotal }),
      this.i18n.t(lang, 'stats.closedThisMonth', { closed: stats.closedThisMonth, created: stats.createdThisMonth }),
    ].join('\n');
    await ctx.reply(message);
  }

  private async sendReport(ctx: Context, user: User) {
    const lang = user.language;
    const ranks = this.i18n.list(lang, 'ranks');
    const current = await this.gamification.currentMonth(user.id);
    const previous = await this.gamification.previousMonth(user.id);

    const lines = [
      this.i18n.t(lang, 'report.title'),
      '',
      this.i18n.t(lang, 'report.currentMonth', {
        count: current.count,
        rankName: ranks[current.level - 1] ?? '',
        rankLevel: current.level,
      }),
      previous
        ? this.i18n.t(lang, 'report.previousMonth', {
            count: previous.count,
            rankName: ranks[previous.level - 1] ?? '',
            rankLevel: previous.level,
          })
        : this.i18n.t(lang, 'report.previousMonthEmpty'),
    ];

    const now = new Date();
    if (now.getMonth() === 0) {
      const yearly = await this.gamification.yearlyReport(user.id, now.getFullYear() - 1);
      if (yearly.rows.length) {
        lines.push('', this.i18n.t(lang, 'report.yearlyTitle', { year: now.getFullYear() - 1 }));
        for (const row of yearly.rows) {
          lines.push(
            this.i18n.t(lang, 'report.yearlyLine', {
              month: String(row.month),
              count: row.completedCount,
              rankName: ranks[row.rankLevel - 1] ?? '',
            }),
          );
        }
        lines.push(this.i18n.t(lang, 'report.yearlyTotal', { total: yearly.total }));
      }
    }

    await ctx.reply(lines.join('\n'));
  }

  private async applyEdit(ctx: Context, user: User, taskId: string, instruction: string) {
    const lang = user.language;
    const task = await this.tasks.getById(taskId);
    if (!task) {
      await this.users.setState(user.id, UserState.IDLE, null);
      await ctx.reply(this.i18n.t(lang, 'actions.notFound'));
      return;
    }

    let structured: StructuredTask;
    try {
      structured = await this.ai.structure({
        text: task.originalText ?? '',
        now: new Date(),
        editInstruction: instruction,
        previous: { deadlineRaw: task.deadlineRaw, description: task.description },
      });
    } catch {
      await ctx.reply(this.i18n.t(lang, 'errors.aiUnavailable'));
      return;
    }

    await this.tasks.applyEdit(taskId, structured);
    await this.users.setState(user.id, UserState.IDLE, null);
    await ctx.reply(this.i18n.t(lang, 'edit.applied'));
    await this.refreshCard(ctx, taskId, lang);
  }

  private async refreshCard(ctx: Context, taskId: string, lang: Language) {
    const task = await this.tasks.getById(taskId);
    if (!task || !task.cardChatId || !task.cardMessageId) return;
    const text = buildCardText(this.i18n, lang, task);
    const chatId = Number(task.cardChatId);
    try {
      if (task.imageFileId) {
        await this.bot.telegram.editMessageCaption(chatId, task.cardMessageId, undefined, text, { parse_mode: 'Markdown' });
      } else {
        await this.bot.telegram.editMessageText(chatId, task.cardMessageId, undefined, text, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      this.logger.warn(`Could not refresh card ${taskId}: ${(error as Error).message}`);
    }
  }

  private async finalizeCollection(ctx: Context, user: User, items: CollectedItem[], fromWhomOrNull: string | null) {
    const lang = user.language;
    await ctx.reply(this.i18n.t(lang, 'collector.processing')).catch(() => undefined);

    const texts = items.filter((item): item is Extract<CollectedItem, { type: 'text' }> => item.type === 'text').map((item) => item.text);
    const photoItems = items.filter((item): item is CollectedPhotoItem => item.type === 'photo');
    const captions = photoItems.map((item) => item.caption).filter((caption): caption is string => Boolean(caption));
    const combinedText = [...texts, ...captions].join('\n\n');

    const images: AiImageInput[] = [];
    for (const photo of photoItems.slice(0, 4)) {
      const mediaType = toClaudeMediaType(photo.mimeType);
      if (!mediaType) continue;
      const base64 = await this.downloadPhotoAsBase64(photo.fileId);
      if (base64) images.push({ base64, mediaType });
    }

    let structured: StructuredTask;
    try {
      structured = await this.ai.structure({
        text: combinedText || '(нет текста, см. изображение)',
        images,
        now: new Date(),
      });
    } catch {
      await ctx.reply(this.i18n.t(lang, 'errors.aiUnavailable'));
      return;
    }

    const task = await this.tasks.create({
      userId: user.id,
      fromWhom: fromWhomOrNull ?? '',
      structured,
      originalText: combinedText,
      imageFileId: photoItems[0]?.fileId,
    });

    await this.sendCard(ctx, task, lang);

    if (!fromWhomOrNull) {
      await this.users.setState(user.id, UserState.AWAITING_SENDER_NAME, task.id);
      await ctx.reply(this.i18n.t(lang, 'senderName.prompt'));
    } else if (user.state === UserState.AWAITING_NEW_TASK) {
      await this.users.setState(user.id, UserState.IDLE, null);
    }

    this.scheduleOriginalDeletion(ctx, items);
  }

  private async sendCard(ctx: Context, task: Task, lang: Language) {
    const text = buildCardText(this.i18n, lang, task);
    const keyboard = cardInlineKeyboard(task.id);

    const message = task.imageFileId
      ? await ctx.replyWithPhoto(task.imageFileId, { caption: text, parse_mode: 'Markdown', ...keyboard })
      : await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });

    await this.tasks.linkCard(task.id, message.chat.id, message.message_id);
  }

  private scheduleOriginalDeletion(ctx: Context, items: CollectedItem[]) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    for (const item of items) {
      const messageId = item.messageId;
      setTimeout(() => {
        this.bot.telegram.deleteMessage(chatId, messageId).catch((error) => {
          this.logger.debug(`Could not delete original message ${messageId}: ${(error as Error).message}`);
        });
      }, this.originalMessageDeleteDelayMs);
    }
  }

  private async downloadPhotoAsBase64(fileId: string): Promise<string | null> {
    try {
      const url = await this.bot.telegram.getFileLink(fileId);
      const response = await fetch(url.toString());
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
      this.logger.warn(`Failed to download photo ${fileId}: ${(error as Error).message}`);
      return null;
    }
  }

  private chatKey(ctx: Context): string {
    return String(ctx.chat?.id ?? ctx.from?.id);
  }
}
