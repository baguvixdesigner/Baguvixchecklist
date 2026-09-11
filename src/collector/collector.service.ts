import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CollectedTextItem {
  type: 'text';
  text: string;
  messageId: number;
}

export interface CollectedPhotoItem {
  type: 'photo';
  fileId: string;
  mediaGroupId?: string;
  caption?: string;
  messageId: number;
  /** Set when the image arrived as a "document" (e.g. forwarded uncompressed); compressed Telegram photos are always JPEG. */
  mimeType?: string;
}

export type CollectedItem = CollectedTextItem | CollectedPhotoItem;

type FlushHandler = (items: CollectedItem[]) => void | Promise<void>;

interface Buffer {
  items: CollectedItem[];
  timer: NodeJS.Timeout;
  flushHandler: FlushHandler;
}

/**
 * Merges a burst of consecutive messages from the same chat into one task:
 * plain text messages via a silence timer (per spec 2.2), photo albums via
 * Telegram's media_group_id (delivered almost instantly, so a short flush is enough).
 */
@Injectable()
export class CollectorService {
  private readonly buffers = new Map<string, Buffer>();
  private readonly textDebounceMs: number;
  private readonly mediaGroupFlushMs = 1200;

  constructor(private readonly config: ConfigService) {
    this.textDebounceMs = Number(this.config.get('MESSAGE_COLLECTION_DEBOUNCE_MS') ?? 4000);
  }

  push(chatKey: string, item: CollectedItem, flushHandler: FlushHandler): void {
    const existing = this.buffers.get(chatKey);
    if (existing) {
      clearTimeout(existing.timer);
      existing.items.push(item);
      existing.flushHandler = flushHandler;
      existing.timer = this.scheduleFlush(chatKey, item);
      return;
    }

    const buffer: Buffer = {
      items: [item],
      flushHandler,
      timer: this.scheduleFlush(chatKey, item),
    };
    this.buffers.set(chatKey, buffer);
  }

  private scheduleFlush(chatKey: string, lastItem: CollectedItem): NodeJS.Timeout {
    const delay = lastItem.type === 'photo' ? this.mediaGroupFlushMs : this.textDebounceMs;
    return setTimeout(() => this.flush(chatKey), delay);
  }

  private async flush(chatKey: string): Promise<void> {
    const buffer = this.buffers.get(chatKey);
    if (!buffer) return;
    this.buffers.delete(chatKey);
    await buffer.flushHandler(buffer.items);
  }
}
