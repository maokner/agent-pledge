import type { RlusdAmount } from "@agent-pledge/shared";
import { formatRlusd } from "@/lib/format";

/** An RLUSD amount shown as dollars. */
export function Money({ amount, className }: { amount: RlusdAmount; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`}>{formatRlusd(amount)}</span>;
}
