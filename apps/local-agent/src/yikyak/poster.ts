import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LogInput } from "../api";
import type { YikYakDriver } from "./drivers";

export interface PostJob {
  task_id: string;
  subtask_id: string;
  text: string;
  /** Sub-task deadline. A queued post whose deadline passed is dropped. */
  deadline?: string | null;
  enqueued_at: string;
}

export type PostOutcome =
  | {
      status: "posted";
      screenshot_path: string;
      posted_at: string;
      real: boolean;
      media_url: string | null;
    }
  | { status: "queued"; position: number; earliest_post_at: string };

/** Persisted in <stateDir>/yikyak-state.json so a restart still respects the 10-minute limit. */
interface PosterState {
  /** Time of the last real post attempt (ms since epoch). */
  last_post_at: number | null;
  queue: PostJob[];
}

export interface PosterOptions {
  driver: YikYakDriver;
  stateFile: string;
  minIntervalMs: number;
  /** Called after each post with the screenshot: uploads it and returns the media URL. */
  onPosted: (job: PostJob, screenshotPath: string, postedAt: string) => Promise<string | null>;
  log: (input: LogInput) => Promise<void>;
  now?: () => number;
}

/**
 * Wraps a YikYakDriver with the rate limit from PRD 8 / R6: at most one real post per interval.
 * Extra posts go into a persisted queue and are posted (and uploaded) when the next slot opens.
 */
export class YikYakPoster {
  private state: PosterState = { last_post_at: null, queue: [] };
  private lock: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private readonly now: () => number;

  private constructor(private readonly opts: PosterOptions) {
    this.now = opts.now ?? Date.now;
  }

  static async open(opts: PosterOptions): Promise<YikYakPoster> {
    const poster = new YikYakPoster(opts);
    try {
      const raw = JSON.parse(await readFile(opts.stateFile, "utf8")) as Partial<PosterState>;
      poster.state = { last_post_at: raw.last_post_at ?? null, queue: raw.queue ?? [] };
    } catch {
      // no state yet
    }
    poster.schedule();
    return poster;
  }

  get lastPostAt(): number | null {
    return this.state.last_post_at;
  }

  get queued(): readonly PostJob[] {
    return this.state.queue;
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.opts.stateFile), { recursive: true });
    const tmp = `${this.opts.stateFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.opts.stateFile);
  }

  private nextSlot(): number {
    const last = this.state.last_post_at;
    return last === null ? this.now() : last + this.opts.minIntervalMs;
  }

  /** Post now if a slot is free, else queue. Throws when the driver fails on an immediate post. */
  submit(job: Omit<PostJob, "enqueued_at">): Promise<PostOutcome> {
    return this.withLock(async () => {
      const full: PostJob = { ...job, enqueued_at: new Date(this.now()).toISOString() };
      if (!this.opts.driver.real) return this.postNow(full);
      if (this.state.queue.length === 0 && this.nextSlot() <= this.now()) {
        this.state.last_post_at = this.now();
        await this.save();
        return this.postNow(full);
      }
      this.state.queue.push(full);
      await this.save();
      const position = this.state.queue.length;
      const earliest = new Date(
        this.nextSlot() + (position - 1) * this.opts.minIntervalMs,
      ).toISOString();
      await this.opts.log({
        level: "decision",
        task_id: job.task_id,
        subtask_id: job.subtask_id,
        message: `Yik Yak rate limit (1 post per ${Math.round(this.opts.minIntervalMs / 60000)} min): queued post #${position}, earliest ${earliest}`,
      });
      this.schedule();
      return { status: "queued", position, earliest_post_at: earliest };
    });
  }

  /** Posts the next queued job if its slot is open. Called by the timer; public for tests. */
  drain(): Promise<void> {
    return this.withLock(async () => {
      while (this.state.queue.length > 0 && this.nextSlot() <= this.now()) {
        const job = this.state.queue.shift()!;
        if (job.deadline && Date.parse(job.deadline) <= this.now()) {
          await this.save();
          await this.opts.log({
            level: "decision",
            task_id: job.task_id,
            subtask_id: job.subtask_id,
            message:
              "Dropped queued Yik Yak post: the sub-task deadline passed before the next slot",
          });
          continue;
        }
        this.state.last_post_at = this.now();
        await this.save();
        try {
          await this.postNow(job);
        } catch (err) {
          await this.opts.log({
            level: "error",
            task_id: job.task_id,
            subtask_id: job.subtask_id,
            message: `Queued Yik Yak post failed: ${(err as Error).message}`,
          });
        }
        break; // one real post per slot
      }
      this.schedule();
    });
  }

  private async postNow(job: PostJob): Promise<PostOutcome> {
    const driver = this.opts.driver;
    let file: string;
    try {
      file = await driver.post(job.text);
    } catch (err) {
      await this.opts.log({
        level: "error",
        task_id: job.task_id,
        subtask_id: job.subtask_id,
        message: `Yik Yak post failed (${driver.name}): ${(err as Error).message}`,
      });
      throw err;
    }
    const postedAt = new Date(this.now()).toISOString();
    await this.opts.log({
      task_id: job.task_id,
      subtask_id: job.subtask_id,
      message: driver.real
        ? `Posted on Yik Yak (${driver.name})`
        : `Rendered a Yik Yak-style preview (${driver.name} driver): NOT a real Yik Yak post`,
    });
    const mediaUrl = await this.opts.onPosted(job, file, postedAt);
    return {
      status: "posted",
      screenshot_path: file,
      posted_at: postedAt,
      real: driver.real,
      media_url: mediaUrl,
    };
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.closed || this.state.queue.length === 0) return;
    const delay = Math.max(0, this.nextSlot() - this.now()) + 50;
    this.timer = setTimeout(() => void this.drain(), delay);
    this.timer.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.lock;
    await this.opts.driver.close?.();
  }
}
