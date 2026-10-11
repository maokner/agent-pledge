/**
 * Runs tasks with the same key one after another, in call order.
 * The core submitTx already serializes signing per account. This queue is for higher level
 * idempotency, for example one failTask per task at a time. It is in-process only.
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
