import { ConfigService } from '@nestjs/config';
import { CollectedItem, CollectorService } from './collector.service';

function makeConfig(debounceMs?: number): ConfigService {
  return { get: () => debounceMs } as unknown as ConfigService;
}

describe('CollectorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not flush a text message before the debounce window elapses', () => {
    const collector = new CollectorService(makeConfig(4000));
    const flush = jest.fn();

    collector.push('chat-1', { type: 'text', text: 'hello', messageId: 1 }, flush);
    jest.advanceTimersByTime(3999);

    expect(flush).not.toHaveBeenCalled();
  });

  it('merges consecutive text messages arriving within the debounce window into one flush', () => {
    const collector = new CollectorService(makeConfig(4000));
    const flush = jest.fn();

    collector.push('chat-1', { type: 'text', text: 'part 1', messageId: 1 }, flush);
    jest.advanceTimersByTime(2000);
    collector.push('chat-1', { type: 'text', text: 'part 2', messageId: 2 }, flush);
    jest.advanceTimersByTime(3999);
    expect(flush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    const items: CollectedItem[] = flush.mock.calls[0][0];
    expect(items).toEqual([
      { type: 'text', text: 'part 1', messageId: 1 },
      { type: 'text', text: 'part 2', messageId: 2 },
    ]);
  });

  it('flushes a photo album quickly instead of waiting the full text debounce', () => {
    const collector = new CollectorService(makeConfig(4000));
    const flush = jest.fn();

    collector.push('chat-1', { type: 'photo', fileId: 'f1', mediaGroupId: 'g1', messageId: 1 }, flush);
    collector.push('chat-1', { type: 'photo', fileId: 'f2', mediaGroupId: 'g1', messageId: 2 }, flush);

    jest.advanceTimersByTime(1199);
    expect(flush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(2);
  });

  it('keeps separate chats independent', () => {
    const collector = new CollectorService(makeConfig(4000));
    const flushA = jest.fn();
    const flushB = jest.fn();

    collector.push('chat-a', { type: 'text', text: 'from A', messageId: 1 }, flushA);
    collector.push('chat-b', { type: 'text', text: 'from B', messageId: 2 }, flushB);

    jest.advanceTimersByTime(4000);

    expect(flushA).toHaveBeenCalledWith([{ type: 'text', text: 'from A', messageId: 1 }]);
    expect(flushB).toHaveBeenCalledWith([{ type: 'text', text: 'from B', messageId: 2 }]);
  });

  it('uses the most recently registered flush handler for a chat', () => {
    const collector = new CollectorService(makeConfig(4000));
    const staleHandler = jest.fn();
    const freshHandler = jest.fn();

    collector.push('chat-1', { type: 'text', text: 'first', messageId: 1 }, staleHandler);
    collector.push('chat-1', { type: 'text', text: 'second', messageId: 2 }, freshHandler);

    jest.advanceTimersByTime(4000);

    expect(staleHandler).not.toHaveBeenCalled();
    expect(freshHandler).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default debounce when no config value is set', () => {
    const collector = new CollectorService(makeConfig(undefined));
    const flush = jest.fn();

    collector.push('chat-1', { type: 'text', text: 'hi', messageId: 1 }, flush);
    jest.advanceTimersByTime(3999);
    expect(flush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
