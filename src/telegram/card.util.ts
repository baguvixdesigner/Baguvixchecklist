import { Task } from '@prisma/client';
import { Language } from '@prisma/client';
import { I18nService } from '../i18n/i18n.service';

export function buildCardText(i18n: I18nService, lang: Language, task: Pick<Task, 'fromWhom' | 'deadlineRaw' | 'description'>): string {
  const deadline = task.deadlineRaw && task.deadlineRaw.trim() ? task.deadlineRaw : i18n.t(lang, 'card.deadlineNotSet');
  return [
    `${i18n.t(lang, 'card.fromLabel')}: ${task.fromWhom || '—'}`,
    `${i18n.t(lang, 'card.deadlineLabel')}: ${deadline}`,
    `${i18n.t(lang, 'card.taskLabel')}: ${task.description}`,
  ].join('\n\n');
}
