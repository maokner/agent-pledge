/**
 * Runs tasks with the same key one after another, in call order.
 * xrpl.js autofill reads the account Sequence, so two transactions from the same account that are
 * submitted at the same time get the same Sequence and one fails. Ops submit every transaction
 * through this queue, keyed by the signing account, so callers can start ops in parallel safely.
 * This is in-process only. Run one server process per signing wallet.
 */
const tails = new Map<string, Promise<unknown>>();

export function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
