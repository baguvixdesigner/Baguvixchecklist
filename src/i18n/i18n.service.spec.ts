import { I18nService } from './i18n.service';

describe('I18nService', () => {
  const i18n = new I18nService();

  it('resolves a nested key for each supported language', () => {
    expect(i18n.t('ru', 'card.fromLabel')).toBe('👤 От кого');
    expect(i18n.t('uz', 'card.fromLabel')).toBe('👤 Kimdan');
    expect(i18n.t('en', 'card.fromLabel')).toBe('👤 From');
  });

  it('interpolates {{placeholders}} with the given params', () => {
    const text = i18n.t('en', 'stats.closedThisMonth', { closed: 3, created: 5 });
    expect(text).toBe('This month: 3 of 5 received closed');
  });

  it('leaves a placeholder blank when no matching param is given', () => {
    const text = i18n.t('en', 'stats.closedThisMonth', { closed: 3 });
    expect(text).toBe('This month: 3 of  received closed');
  });

  it('falls back to Russian when asked for an unsupported language', () => {
    const text = i18n.t('fr' as any, 'card.fromLabel');
    expect(text).toBe('👤 От кого');
  });

  it('returns the key itself when the path does not resolve to a string', () => {
    expect(i18n.t('ru', 'no.such.key')).toBe('no.such.key');
  });

  it('lists all 10 rank names per language', () => {
    expect(i18n.list('ru', 'ranks')).toHaveLength(10);
    expect(i18n.list('uz', 'ranks')).toHaveLength(10);
    expect(i18n.list('en', 'ranks')).toHaveLength(10);
    expect(i18n.list('ru', 'ranks')[0]).toBe('Стажёр');
  });

  it('returns an empty array for a non-array key', () => {
    expect(i18n.list('ru', 'card.fromLabel')).toEqual([]);
  });

  it('finds the menu key matching a button label in any language', () => {
    expect(i18n.findKeyByValue('menu', '➕ Новая задача')).toBe('newTask');
    expect(i18n.findKeyByValue('menu', '➕ Yangi vazifa')).toBe('newTask');
    expect(i18n.findKeyByValue('menu', '➕ New task')).toBe('newTask');
  });

  it('returns null when no menu label matches', () => {
    expect(i18n.findKeyByValue('menu', 'random text')).toBeNull();
  });
});
