"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { selectTaskViews } from "@/lib/board/selectors";
import { buildPreviewState, PREVIEW_LAYOUTS, type PreviewLayout } from "@/lib/fixtures/preview";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { TaskCard } from "./TaskCard";

/**
 * Fixture-only layout check for the board cards (#32): static board states
 * in the same column widths as the live board. Not linked from the board.
 */
export function BoardPreview({ layout }: { layout: PreviewLayout }) {
  // The fixture clock starts when the page mounts in the browser, never during prerender.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  const tasks = now === null ? [] : selectTaskViews(buildPreviewState(layout, now));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Board preview</h1>
        <FixtureBadge />
        <nav className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(PREVIEW_LAYOUTS) as PreviewLayout[]).map((key) => (
            <Link
              key={key}
              href={`/preview?layout=${key}`}
              className={`rounded border px-2 py-1 ${key === layout ? "border-zinc-900 font-semibold dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-600"}`}
            >
              {PREVIEW_LAYOUTS[key]}
            </Link>
          ))}
          <Link href="/" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600">
            Live board
          </Link>
        </nav>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Tasks" className="flex flex-col gap-6">
          {tasks.map((view) => (
            <TaskCard key={view.task.id} view={view} />
          ))}
        </section>
        <aside className="h-fit rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-600">
          The agent log goes here on the live board.
        </aside>
      </div>
    </div>
  );
}
