import { AiImageInput } from './ai.service';

const SUPPORTED: ReadonlySet<AiImageInput['mediaType']> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Maps a Telegram-reported mime type to one Claude's vision API accepts.
 * Compressed Telegram photos have no mime type of their own and are always
 * JPEG; images sent as documents carry a real mime type that may not be
 * one Claude supports (e.g. image/bmp) — those are filtered out by the caller.
 */
export function toClaudeMediaType(mimeType: string | undefined): AiImageInput['mediaType'] | null {
  const candidate = mimeType ?? 'image/jpeg';
  return SUPPORTED.has(candidate as AiImageInput['mediaType']) ? (candidate as AiImageInput['mediaType']) : null;
}
