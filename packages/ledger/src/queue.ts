/**
 * Runs tasks with the same key one after another, in call order. In-process only.
 * submitTx uses it per account (key `account|<address>`), so autofilled Sequence numbers stay
 * unique. The ops use it per task (see `taskLockKey`), so a payout and a failTask never interleave.
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
