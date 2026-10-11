import type { AgentLogLine } from "@agent-pledge/shared";

const LEVEL_CLASS: Record<AgentLogLine["level"], string> = {
  info: "text-zinc-600 dark:text-zinc-300",
  decision: "font-semibold text-sky-800 dark:text-sky-300",
  warning: "text-amber-700 dark:text-amber-300",
  error: "font-semibold text-rose-700 dark:text-rose-300",
};

/** The local agent's decision log (PRD 9.1), newest first. */
export function AgentLog({ lines }: { lines: AgentLogLine[] }) {
  const recent = lines.slice(-30).reverse();
  return (
    <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 lg:sticky lg:top-6">
      <h2 className="text-lg font-semibold">Agent log</h2>
      {recent.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2 text-sm">
          {recent.map((line) => (
            <li key={line.id} className={LEVEL_CLASS[line.level]}>
              <time className="mr-2 font-mono text-xs text-zinc-400" dateTime={line.at}>
                {new Date(line.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </time>
              {line.message}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
