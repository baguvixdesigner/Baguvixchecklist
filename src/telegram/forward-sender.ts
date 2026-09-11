import { Message } from 'telegraf/typings/core/types/typegram';

/**
 * Best-effort extraction of "who forwarded this to me" from a Telegram message.
 * Returns null when Telegram genuinely gives us nothing usable (sender fully
 * hidden with no display name) — the caller should then ask the user to type
 * the sender's name manually, per spec section 3.
 */
export function extractForwardSenderName(message: Message): string | null {
  const anyMessage = message as unknown as {
    forward_origin?: {
      type: 'user' | 'hidden_user' | 'chat' | 'channel';
      sender_user?: { first_name?: string; username?: string };
      sender_user_name?: string;
      sender_chat?: { title?: string; username?: string };
      chat?: { title?: string; username?: string };
    };
    forward_from?: { first_name?: string; username?: string };
    forward_from_chat?: { title?: string; username?: string };
    forward_sender_name?: string;
  };

  const origin = anyMessage.forward_origin;
  if (origin) {
    switch (origin.type) {
      case 'user':
        return formatPersonName(origin.sender_user?.first_name, origin.sender_user?.username);
      case 'hidden_user':
        // Telegram sometimes still exposes a display name even when the account link is hidden.
        return origin.sender_user_name ?? null;
      case 'channel':
        return origin.chat?.title ?? null;
      case 'chat':
        return origin.sender_chat?.title ?? null;
    }
  }

  // Pre-Bot-API-7.0 fallbacks, kept for older clients/edge cases.
  if (anyMessage.forward_from) {
    return formatPersonName(anyMessage.forward_from.first_name, anyMessage.forward_from.username);
  }
  if (anyMessage.forward_from_chat?.title) {
    return anyMessage.forward_from_chat.title;
  }
  if (anyMessage.forward_sender_name) {
    return anyMessage.forward_sender_name;
  }

  return null;
}

export function isForwardedMessage(message: Message): boolean {
  const anyMessage = message as unknown as {
    forward_origin?: unknown;
    forward_from?: unknown;
    forward_from_chat?: unknown;
    forward_sender_name?: unknown;
  };
  return Boolean(
    anyMessage.forward_origin || anyMessage.forward_from || anyMessage.forward_from_chat || anyMessage.forward_sender_name,
  );
}

function formatPersonName(firstName?: string, username?: string): string | null {
  if (firstName) return username ? `${firstName} (@${username})` : firstName;
  if (username) return `@${username}`;
  return null;
}
