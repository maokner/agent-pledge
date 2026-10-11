/** Injectable clock so tests can control time (deadlines, the scheduler). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock tests can move forward. */
export class ManualClock implements Clock {
  private t: number;
  constructor(start: Date | number = Date.UTC(2026, 9, 11, 18, 0, 0)) {
    this.t = typeof start === "number" ? start : start.getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(d: Date): void {
    this.t = d.getTime();
  }
}
