import { cn } from "@/lib/cn";

/** A compact label / value list for a card, laid out on the character grid. */
export function Facts({ className, children }: { className?: string; children: React.ReactNode }) {
  return <dl className={cn("mt-3 flex flex-wrap gap-x-6 gap-y-2", className)}>{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm tracking-wide text-term-fg-dim uppercase">{label}</dt>
      <dd className="text-base wrap-anywhere">{children}</dd>
    </div>
  );
}
