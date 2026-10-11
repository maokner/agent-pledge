import Link from "next/link";
import { cn } from "@/lib/cn";
import { FIXTURE_MODE } from "@/lib/config";
import { Badge } from "./Badge";

/**
 * The thin top bar of a human page: the name (links home) and, in fixture mode,
 * a "Fixture data" badge so nobody mistakes it for live data. `children` go on the right.
 */
export function HumanHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <header className={cn("flex min-h-14 items-center justify-between gap-3", className)}>
      <Link
        href="/"
        className="-mx-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-lg font-bold tracking-tight text-human-fg outline-none focus-visible:ring-2 focus-visible:ring-human-ring"
      >
        <span aria-hidden="true" className="size-5 rounded-md bg-human-gradient shadow-human-accent" />
        Agent Pledge
      </Link>
      <div className="flex items-center gap-2">
        {FIXTURE_MODE && (
          <Badge tone="warning" size="sm">
            Fixture data
          </Badge>
        )}
        {children}
      </div>
    </header>
  );
}
