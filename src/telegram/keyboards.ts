import { Markup } from 'telegraf';
import { Language } from '@prisma/client';
import { I18nService } from '../i18n/i18n.service';

export function languageInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🇷🇺 Русский', 'lang:ru')],
    [Markup.button.callback('🇺🇿 O‘zbekcha', 'lang:uz')],
    [Markup.button.callback('🇬🇧 English', 'lang:en')],
  ]);
}

export function mainMenuKeyboard(i18n: I18nService, lang: Language) {
  return Markup.keyboard([
    [i18n.t(lang, 'menu.report'), i18n.t(lang, 'menu.stats')],
    [i18n.t(lang, 'menu.newTask')],
    [i18n.t(lang, 'menu.settings'), i18n.t(lang, 'menu.help')],
  ]).resize();
}

export function cardInlineKeyboard(taskId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅', `task:done:${taskId}`),
      Markup.button.callback('✏️', `task:edit:${taskId}`),
      Markup.button.callback('❌', `task:cancel:${taskId}`),
    ],
  ]);
}
