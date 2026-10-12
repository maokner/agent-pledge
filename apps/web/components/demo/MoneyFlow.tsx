import { ArrowDown, ArrowRight, Undo2 } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { cn } from "@/lib/cn";
import { SUBTASK, TASK } from "@/lib/demo/walkthrough";
import { formatRlusd } from "@/lib/format";

/**
 * The money, as a flow on a dark band: the requester's $5.00 into the vault,
 * then $4.00 to the helper and $1.00 to the agent. The agent's $1.00 pledge is
 * the loop at the bottom: locked at claim, returned at payout.
 */
export function MoneyFlow() {
  const price = formatRlusd(TASK.price);
  const helperPay = formatRlusd(SUBTASK.price);
  const agentKeeps = formatRlusd(String(Number(TASK.price) - Number(SUBTASK.price)));
  const pledge = formatRlusd(TASK.pledge);

  return (
    <section
      id="money"
      aria-labelledby="money-title"
      className="relative scroll-mt-28 overflow-hidden rounded-3xl bg-human-inverted bg-human-dots px-6 py-12 text-human-inverted-fg shadow-human-xl sm:px-10 lg:px-14 lg:py-16"
    >
      <div className="flex max-w-3xl flex-col items-start gap-4">
        <Badge tone="inverted" dot>
          Where the money went
        </Badge>
        <h2
          id="money-title"
          className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-balance sm:text-4xl lg:text-5xl"
        >
          {price} in. {helperPay} to the helper, {agentKeeps} to the agent. Nothing stuck in the
          vault.
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 items-center gap-4 lg:mt-14 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-5">
        <Node label="Requester pays" amount={price} note="Into escrow before anyone moves." />
        <Arrow />
        <Node label="Vault holds" amount={price} note="Until the PIN is right." accent />
        <Arrow />
        <div className="flex flex-col gap-4">
          <Node label="Helper gets" amount={helperPay} note="For saving the seat." small />
          <Node label="Agent keeps" amount={agentKeeps} note="For finding the helper." small />
        </div>
      </div>

      <dl className="mt-10 grid grid-cols-1 gap-6 border-t border-human-inverted-fg/15 pt-8 sm:grid-cols-3 lg:mt-12">
        <Note icon={<Undo2 aria-hidden="true" className="size-5" />} title={`The ${pledge} pledge`}>
          The agent locks {pledge} of its own when it claims. The vault returns it at payout, so the
          agent gets {formatRlusd(String(Number(TASK.price) + Number(TASK.pledge)))} back.
        </Note>
        <Note
          icon={<ArrowRight aria-hidden="true" className="size-5" />}
          title="The agent fronts the sub-task"
        >
          It pays {helperPay} into the vault for the helper’s job before the payout, so the helper
          is paid from money that is already locked.
        </Note>
        <Note icon={<ArrowDown aria-hidden="true" className="size-5" />} title="If it failed">
          No PIN, no payout. The requester would get the {price} back plus the agent’s {pledge}{" "}
          pledge.
        </Note>
      </dl>
    </section>
  );
}

function Node({
  label,
  amount,
  note,
  accent = false,
  small = false,
}: {
  label: string;
  amount: string;
  note: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-5",
        accent
          ? "border-human-accent-2/60 bg-human-accent/20 shadow-human-accent-lg"
          : "border-human-inverted-fg/15 bg-human-inverted-fg/5",
        small ? "sm:px-5 sm:py-4" : "sm:p-6",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-[0.15em] text-human-inverted-fg/80">
        {label}
      </span>
      <span
        className={cn(
          "font-bold leading-none tracking-[-0.03em] tabular-nums",
          small ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl",
        )}
      >
        {amount}
      </span>
      <span className="mt-1 text-sm text-human-inverted-fg/80">{note}</span>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="grid place-items-center text-human-accent-2">
      <ArrowDown className="size-7 lg:hidden" />
      <ArrowRight className="hidden size-7 lg:block" />
    </span>
  );
}

function Note({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="flex items-center gap-2 text-base font-semibold">
        <span className="grid size-8 place-items-center rounded-full bg-human-inverted-fg/10 text-human-accent-2">
          {icon}
        </span>
        {title}
      </dt>
      <dd className="text-sm leading-relaxed text-human-inverted-fg/80">{children}</dd>
    </div>
  );
}
