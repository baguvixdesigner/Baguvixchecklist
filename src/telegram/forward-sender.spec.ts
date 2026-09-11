import { Message } from 'telegraf/typings/core/types/typegram';
import { extractForwardSenderName, isForwardedMessage } from './forward-sender';

function msg(extra: Record<string, unknown>): Message {
  return { message_id: 1, date: 0, chat: { id: 1, type: 'private' }, ...extra } as unknown as Message;
}

describe('isForwardedMessage', () => {
  it('is false for a plain message', () => {
    expect(isForwardedMessage(msg({ text: 'hi' }))).toBe(false);
  });

  it('is true when forward_origin is present', () => {
    expect(isForwardedMessage(msg({ forward_origin: { type: 'user' } }))).toBe(true);
  });
});

describe('extractForwardSenderName', () => {
  it('formats a visible user origin as "Name (@username)"', () => {
    const name = extractForwardSenderName(
      msg({ forward_origin: { type: 'user', sender_user: { first_name: 'Aziz', username: 'aziz_dev' } } }),
    );
    expect(name).toBe('Aziz (@aziz_dev)');
  });

  it('falls back to @username when there is no first name', () => {
    const name = extractForwardSenderName(msg({ forward_origin: { type: 'user', sender_user: { username: 'aziz_dev' } } }));
    expect(name).toBe('@aziz_dev');
  });

  it('uses sender_user_name for a hidden_user origin when Telegram supplies one', () => {
    const name = extractForwardSenderName(msg({ forward_origin: { type: 'hidden_user', sender_user_name: 'Botir' } }));
    expect(name).toBe('Botir');
  });

  it('returns null for a hidden_user origin with no display name at all', () => {
    const name = extractForwardSenderName(msg({ forward_origin: { type: 'hidden_user' } }));
    expect(name).toBeNull();
  });

  it('uses the channel title for a channel origin', () => {
    const name = extractForwardSenderName(msg({ forward_origin: { type: 'channel', chat: { title: 'IPAKOR News' } } }));
    expect(name).toBe('IPAKOR News');
  });

  it('uses the sender chat title for a chat origin', () => {
    const name = extractForwardSenderName(msg({ forward_origin: { type: 'chat', sender_chat: { title: 'Team Chat' } } }));
    expect(name).toBe('Team Chat');
  });

  it('falls back to legacy forward_from when forward_origin is absent', () => {
    const name = extractForwardSenderName(msg({ forward_from: { first_name: 'Dilnoza' } }));
    expect(name).toBe('Dilnoza');
  });

  it('falls back to legacy forward_sender_name', () => {
    const name = extractForwardSenderName(msg({ forward_sender_name: 'Hidden Colleague' }));
    expect(name).toBe('Hidden Colleague');
  });

  it('returns null when there is nothing to extract', () => {
    expect(extractForwardSenderName(msg({ text: 'hi' }))).toBeNull();
  });
});
