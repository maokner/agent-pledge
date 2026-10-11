import { cn } from "@/lib/cn";

/**
 * The board's page: black, monospace, with the faint CRT scanlines over
 * everything (fainter in projector mode, see globals.css). The scanlines
 * never catch clicks. Projector mode fills the screen with no scrolling.
 */
export function BoardShell({
  projector = false,
  children,
}: {
  projector?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="term-scanlines fixed inset-0 z-40" />
      <div
        className={cn(
          "flex w-full flex-col gap-4",
          projector ? "p-4 lg:h-dvh lg:overflow-hidden" : "mx-auto max-w-7xl p-3 sm:p-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}
