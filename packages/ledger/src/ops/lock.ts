import { runExclusive } from "../queue.js";

/**
 * The lock key for one task of one vault. failTask and the payout ops (createPayoutOffer,
 * acceptPayoutOffer, redeem) run under it, so a payout and a refund of the same task never
 * interleave in this process.
 */
export function taskLockKey(vaultAddress: string, taskId: string): string {
  return `task|${vaultAddress}|${taskId}`;
}

/** Runs `fn` under the task lock. Without a task ID there is nothing to lock, so it just runs. */
export function withTaskLock<T>(
  vaultAddress: string,
  taskId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return taskId === undefined ? fn() : runExclusive(taskLockKey(vaultAddress, taskId), fn);
}
