import { toClaudeMediaType } from './claude-media-type';

describe('toClaudeMediaType', () => {
  it('defaults to image/jpeg when no mime type is given (compressed Telegram photo)', () => {
    expect(toClaudeMediaType(undefined)).toBe('image/jpeg');
  });

  it('passes through mime types Claude supports', () => {
    expect(toClaudeMediaType('image/png')).toBe('image/png');
    expect(toClaudeMediaType('image/webp')).toBe('image/webp');
    expect(toClaudeMediaType('image/gif')).toBe('image/gif');
    expect(toClaudeMediaType('image/jpeg')).toBe('image/jpeg');
  });

  it('rejects a mime type Claude does not support', () => {
    expect(toClaudeMediaType('image/bmp')).toBeNull();
    expect(toClaudeMediaType('application/pdf')).toBeNull();
  });
});
