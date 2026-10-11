import type { ClaimView } from "@agent-pledge/shared";
import { Money } from "@/components/ui/Money";
import { formatMsLeft } from "@/lib/claim/clock";
import { CARD } from "./parts";

const URGENT_MS = 60_000;

/**
 * The sub-task: the pay in big type, the place, and the time left (PRD 9.2 step 1).
 * `left` is milliseconds left on the server's clock, or null before the first tick.
 */
export function SubtaskSummary({ view, left, compact = false }: { view: ClaimView; left: number | null; compact?: boolean }) {
  const { subtask } = view;
  const live = view.state === "open" || view.state === "claimed_by_you";
  const urgent = live && left !== null && left < URGENT_MS;
  return (
    <section className={CARD} aria-label="The task">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{live ? "You get" : "Pay"}</p>
      <p className={`font-extrabold leading-none tracking-tight ${compact ? "text-4xl" : "mt-1 text-6xl"}`}>
        <Money amount={subtask.price} />
      </p>
      <h2 className={`font-bold leading-snug ${compact ? "mt-2 text-xl" : "mt-4 text-2xl"}`}>{subtask.description}</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
        <dt className="text-zinc-500 dark:text-zinc-400">Where</dt>
        <dd className="font-medium">{subtask.place}</dd>
        {live ? (
          <>
            <dt className="text-zinc-500 dark:text-zinc-400">Time left</dt>
            <dd>
              <span
                role="timer"
                aria-live="off"
                className={`font-bold tabular-nums ${urgent ? "text-rose-600 dark:text-rose-400" : ""}`}
              >
                {left === null ? "–:––" : formatMsLeft(left)}
              </span>{" "}
              <span className="text-zinc-500 dark:text-zinc-400">of {subtask.time_limit_minutes} min</span>
            </dd>
          </>
        ) : (
          <>
            <dt className="text-zinc-500 dark:text-zinc-400">Time limit</dt>
            <dd className="font-medium">{subtask.time_limit_minutes} min</dd>
          </>
        )}
      </dl>
    </section>
  );
}
