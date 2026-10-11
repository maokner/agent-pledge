import type { ClaimState, TxStatus, WorkStatus } from "@agent-pledge/shared";
import { CLAIM_STATE_LABEL, TX_STATUS_LABEL, WORK_STATUS_LABEL } from "@/lib/labels";

type Tone = "neutral" | "info" | "good" | "bad" | "wait";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-800 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600",
  info: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700",
  good: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700",
  bad: "bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-700",
  wait: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700",
};

const WORK_TONE: Record<WorkStatus, Tone> = { open: "neutral", claimed: "info", done: "good", failed: "bad" };
const TX_TONE: Record<TxStatus, Tone> = { pending: "wait", validated: "good", failed: "bad" };
const CLAIM_TONE: Record<ClaimState, Tone> = {
  open: "neutral",
  claimed_by_you: "info",
  already_claimed: "bad",
  expired: "bad",
  locked: "bad",
  paying: "wait",
  paid: "good",
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  return <Badge tone={WORK_TONE[status]}>{WORK_STATUS_LABEL[status]}</Badge>;
}

export function TxStatusBadge({ status }: { status: TxStatus }) {
  return <Badge tone={TX_TONE[status]}>{TX_STATUS_LABEL[status]}</Badge>;
}

export function ClaimStateBadge({ state }: { state: ClaimState }) {
  return <Badge tone={CLAIM_TONE[state]}>{CLAIM_STATE_LABEL[state]}</Badge>;
}
