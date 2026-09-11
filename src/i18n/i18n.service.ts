import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Language } from '@prisma/client';

type Dict = Record<string, unknown>;

const LOCALES: Language[] = ['ru', 'uz', 'en'];

@Injectable()
export class I18nService {
  private readonly dicts: Record<Language, Dict>;

  constructor() {
    this.dicts = LOCALES.reduce((acc, lang) => {
      const path = join(__dirname, 'locales', `${lang}.json`);
      acc[lang] = JSON.parse(readFileSync(path, 'utf-8'));
      return acc;
    }, {} as Record<Language, Dict>);
  }

  /** Dot-path lookup, e.g. t('ru', 'card.fromLabel'). */
  t(lang: Language, key: string, params?: Record<string, string | number>): string {
    const value = this.resolve(this.dicts[lang] ?? this.dicts.ru, key) ?? this.resolve(this.dicts.ru, key);
    if (typeof value !== 'string') {
      return key;
    }
    return this.interpolate(value, params);
  }

  /** Returns a locale array value, e.g. the 10 rank names. */
  list(lang: Language, key: string): string[] {
    const value = this.resolve(this.dicts[lang] ?? this.dicts.ru, key) ?? this.resolve(this.dicts.ru, key);
    return Array.isArray(value) ? (value as string[]) : [];
  }

  /** Finds which key under `section` has this exact display text, in any locale. Used to match reply-keyboard menu buttons regardless of the user's language. */
  findKeyByValue(section: string, text: string): string | null {
    for (const lang of LOCALES) {
      const dict = this.dicts[lang][section] as Dict | undefined;
      if (!dict) continue;
      for (const [key, value] of Object.entries(dict)) {
        if (value === text) return key;
      }
    }
    return null;
  }

  private resolve(dict: Dict, key: string): unknown {
    return key.split('.').reduce<unknown>((node, segment) => {
      if (node && typeof node === 'object' && segment in (node as Dict)) {
        return (node as Dict)[segment];
      }
      return undefined;
    }, dict);
  }

  private interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/{{(\w+)}}/g, (_, name) => String(params[name] ?? ''));
  }
}
