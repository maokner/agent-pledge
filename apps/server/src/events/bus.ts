import type {
  BoardEvent,
  BoardEventData,
  BoardEventOf,
  BoardEventType,
} from "@agent-pledge/shared";
import type { Clock } from "../lib/clock";
import { systemClock } from "../lib/clock";

export type BoardEventListener = (event: BoardEvent) => void;

/**
 * In-process event bus for the board.
 * - publish() assigns a monotonically increasing seq (starting at the boot time in ms, so seq keeps
 *   increasing across restarts), stores the event in a ring buffer, and notifies subscribers.
 * - since(seq) returns the events after seq, or null when the client is too far behind (or ahead,
 *   e.g. from before a restart) and needs a full snapshot instead.
 */
export class EventBus {
  private seq: number;
  private readonly buffer: BoardEvent[] = [];
  private readonly listeners = new Set<BoardEventListener>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly capacity = 1000,
    startSeq = clock.now().getTime(),
  ) {
    this.seq = startSeq;
  }

  /** The seq of the last published event (or the start value when nothing was published). */
  get latestSeq(): number {
    return this.seq;
  }

  publish<K extends BoardEventType>(type: K, data: BoardEventData[K]): BoardEventOf<K> {
    const event = {
      seq: ++this.seq,
      type,
      at: this.clock.now().toISOString(),
      data,
    } as BoardEventOf<K>;
    this.buffer.push(event as unknown as BoardEvent);
    if (this.buffer.length > this.capacity) this.buffer.shift();
    for (const l of this.listeners) {
      try {
        l(event as unknown as BoardEvent);
      } catch {
        // A broken subscriber must not break publishers.
      }
    }
    return event;
  }

  subscribe(listener: BoardEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Events with seq > `seq`, oldest first; null when a snapshot is needed. */
  since(seq: number): BoardEvent[] | null {
    if (seq === this.seq) return [];
    if (seq > this.seq) return null;
    const first = this.buffer[0];
    if (!first || seq < first.seq - 1) return null;
    return this.buffer.filter((e) => e.seq > seq);
  }

  /** Recent events (for tests and debugging). */
  recent(): BoardEvent[] {
    return [...this.buffer];
  }
}
