/** A compact label / value list for a card. */
export function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}
