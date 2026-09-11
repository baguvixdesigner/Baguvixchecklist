import { parseStructuredResponse } from './parse-structured-response';

describe('parseStructuredResponse', () => {
  it('parses a bare JSON object', () => {
    const result = parseStructuredResponse('{"deadline": "до пятницы", "description": "Подготовить отчёт"}');
    expect(result).toEqual({ deadlineRaw: 'до пятницы', description: 'Подготовить отчёт' });
  });

  it('treats a null deadline as no deadline', () => {
    const result = parseStructuredResponse('{"deadline": null, "description": "Сделать что-то"}');
    expect(result.deadlineRaw).toBeNull();
  });

  it('extracts the JSON object even when wrapped in prose or markdown fences', () => {
    const raw = 'Here you go:\n```json\n{"deadline": "завтра", "description": "Позвонить клиенту"}\n```';
    const result = parseStructuredResponse(raw);
    expect(result).toEqual({ deadlineRaw: 'завтра', description: 'Позвонить клиенту' });
  });

  it('falls back to the raw text as the description when the reply is not JSON at all', () => {
    const result = parseStructuredResponse('Sorry, I could not process that.');
    expect(result).toEqual({ deadlineRaw: null, description: 'Sorry, I could not process that.' });
  });

  it('falls back to the raw text when description is missing from otherwise-valid JSON', () => {
    const result = parseStructuredResponse('{"deadline": "today"}');
    expect(result.description).toBe('{"deadline": "today"}');
  });

  it('trims whitespace around the description', () => {
    const result = parseStructuredResponse('{"deadline": null, "description": "  Сделать отчёт  "}');
    expect(result.description).toBe('Сделать отчёт');
  });
});
