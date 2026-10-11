import { BoardLink } from "./parts";

export type ClosedReason = "already_claimed" | "expired" | "locked" | "not_found";

const MESSAGE: Record<ClosedReason, { title: string; body: string }> = {
  already_claimed: {
    title: "Already claimed",
    body: "Someone else tapped Claim first. Only one person can hold this task, so there is nothing to do here.",
  },
  expired: {
    title: "Time is up",
    body: "This task ended before it was finished. Nobody was paid, and the money went back to the person who asked.",
  },
  locked: {
    title: "Locked",
    body: "The PIN was wrong three times, so this task is locked and will not pay out.",
  },
  not_found: {
    title: "This link does not work",
    body: "Check that you opened the whole link from the post. The code is the 4 characters after /c/.",
  },
};

/** Why this phone cannot do the sub-task (PRD 2.3, 9.2 step 4), with a way to the board. */
export function ClaimClosed({ reason }: { reason: ClosedReason }) {
  const { title, body } = MESSAGE[reason];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="claim-closed-title">
      <div className="rounded-2xl bg-zinc-200/70 p-5 dark:bg-zinc-800">
        <h2 id="claim-closed-title" className="text-3xl font-extrabold">
          {title}
        </h2>
        <p className="mt-2 text-lg">{body}</p>
      </div>
      <BoardLink />
    </section>
  );
}
