import type { ClaimState } from "@agent-pledge/shared";

const MESSAGE: Record<"already_claimed" | "expired" | "locked", { title: string; body: string }> = {
  already_claimed: { title: "Already claimed", body: "Someone else claimed this first." },
  expired: { title: "Time is up", body: "This sub-task has ended. The money went back to the requester." },
  locked: { title: "Locked", body: "Three wrong PINs were entered, so this sub-task is locked." },
};

/** Why this phone cannot do the sub-task. */
export function ClaimClosed({ state }: { state: Extract<ClaimState, keyof typeof MESSAGE> }) {
  const { title, body } = MESSAGE[state];
  return (
    <section className="rounded-xl bg-zinc-100 p-5 dark:bg-zinc-800">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1">{body}</p>
    </section>
  );
}
