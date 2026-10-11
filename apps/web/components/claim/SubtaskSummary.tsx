import type { ClaimView } from "@agent-pledge/shared";
import { Countdown } from "@/components/ui/Countdown";
import { Money } from "@/components/ui/Money";

/** The sub-task: the place, the time limit and the pay (PRD 9.2 step 1). */
export function SubtaskSummary({ claim }: { claim: ClaimView }) {
  const { subtask } = claim;
  const live = claim.state === "open" || claim.state === "claimed_by_you";
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-4xl font-bold">
        <Money amount={subtask.price} />
      </p>
      <h2 className="mt-2 text-xl font-semibold">{subtask.description}</h2>
      <p className="text-zinc-600 dark:text-zinc-300">{subtask.place}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {live ? (
          <>
            Time left: <Countdown deadline={subtask.deadline_at} className="font-semibold" />
          </>
        ) : (
          <>Time limit: {subtask.time_limit_minutes} min</>
        )}
      </p>
    </section>
  );
}
