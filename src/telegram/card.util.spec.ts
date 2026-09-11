import { I18nService } from '../i18n/i18n.service';
import { buildCardText } from './card.util';

describe('buildCardText', () => {
  const i18n = new I18nService();

  it('renders from/deadline/task on three lines', () => {
    const text = buildCardText(i18n, 'ru', {
      fromWhom: 'Иван',
      deadlineRaw: 'до пятницы',
      description: 'Подготовить отчёт',
    });
    expect(text).toBe('👤 От кого: Иван\n📅 Дедлайн: до пятницы\n📝 Задача: Подготовить отчёт');
  });

  it('shows the localized "not set" label when deadline is null', () => {
    const text = buildCardText(i18n, 'en', { fromWhom: 'Myself', deadlineRaw: null, description: 'Do the thing' });
    expect(text).toContain('📅 Deadline: not specified');
  });

  it('shows the localized "not set" label when deadline is an empty string', () => {
    const text = buildCardText(i18n, 'uz', { fromWhom: 'Men', deadlineRaw: '   ', description: 'Ish' });
    expect(text).toContain("📅 Muddat: ko‘rsatilmagan");
  });

  it('falls back to an em dash when fromWhom is empty', () => {
    const text = buildCardText(i18n, 'ru', { fromWhom: '', deadlineRaw: 'завтра', description: 'Что-то' });
    expect(text).toContain('👤 От кого: —');
  });
});
