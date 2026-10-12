import { cn } from "@/lib/cn";
import { SiteNav, type NavPage } from "./SiteNav";

/**
 * The page frame for /human, /c/[code] and /demo: a skip link, the sticky SiteNav,
 * and a centered `max-w-6xl` <main>. On large screens a faint accent glow sits
 * behind the top of the page (decoration only, hidden on phones).
 */
export function HumanShell({
  current,
  className,
  children,
}: {
  /** The page, so the nav marks its link as current. */
  current?: NavPage;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-human-card px-4 py-3 font-semibold text-human-fg shadow-human-lg outline-none focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-2 focus-visible:ring-human-ring"
      >
        Skip to content
      </a>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block"
      >
        <div className="absolute inset-x-0 top-0 h-[44rem] bg-human-corner-glow" />
        <div className="absolute inset-x-0 top-0 h-[36rem] -scale-x-100 bg-human-corner-glow opacity-60" />
      </div>
      <SiteNav current={current} />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 outline-none sm:px-6 lg:px-8 lg:pt-14",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
