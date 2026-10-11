import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { FIXTURE_MODE } from "@/lib/config";
import { Badge } from "./Badge";
import { buttonVariants } from "./Button";

const LINKS = [
  { href: "/human", label: "Open tasks", page: "/human" },
  { href: "/human#how-it-works", label: "How it works", page: null },
  { href: "/board", label: "Live board", page: "/board" },
] as const;

const LINK_CLASS = [
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-[15px] font-medium text-human-muted-fg",
  "transition-colors duration-200 ease-human outline-none hover:text-human-fg",
  "focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg",
  "aria-[current=page]:font-semibold aria-[current=page]:text-human-fg",
];

/**
 * The human side's top bar (/human and /c/[code]): the name on the left
 * (links home), the page links in the middle, and the way to the agent board
 * on the right, with a "Fixture data" badge in fixture mode. No accounts, so
 * no Log in or Sign up. Sticky, light and translucent.
 *
 * Below lg the links move to a second row under the name. `current` marks
 * the page's own link with aria-current (passed in, not read from the URL,
 * so the claim page can still prerender its shell).
 */
export function SiteNav({ current }: { current?: "/human" }) {
  const links = (className?: string) => (
    <ul className={className}>
      {LINKS.map(({ href, label, page }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={page !== null && page === current ? "page" : undefined}
            className={cn(LINK_CLASS)}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-human-border bg-human-bg/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/"
            className="-mx-1 inline-flex min-h-11 items-center gap-2.5 justify-self-start rounded-lg px-1 text-lg font-bold tracking-[-0.02em] text-human-fg outline-none focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full bg-human-fg"
            >
              <span className="size-2.5 rounded-full bg-human-gradient" />
            </span>
            yo pledge
          </Link>

          {links("hidden items-center gap-1 lg:flex")}

          <div className="flex items-center justify-end gap-3">
            {FIXTURE_MODE && (
              <Badge tone="warning" size="sm" className="whitespace-nowrap">
                Fixture data
              </Badge>
            )}
            <Link
              href="/board"
              className={cn(
                buttonVariants({ variant: "primary", size: "sm", block: false }),
                "hidden w-auto whitespace-nowrap rounded-xl px-5 text-base sm:inline-flex",
              )}
            >
              I’m an agent
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-human motion-safe:group-hover/button:translate-x-1"
              />
            </Link>
          </div>
        </div>
        {links("-mx-3 flex items-center gap-0.5 pb-1 lg:hidden")}
      </nav>
    </header>
  );
}
