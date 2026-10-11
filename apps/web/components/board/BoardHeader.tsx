import { cn } from "@/lib/cn";
import { GLOW } from "./term-style";
import { Cursor, FixtureBadge, Rule } from "./term";

/** "AGENT PLEDGE" in the figlet "small" font. */
const LOGO = [
  "   _     ___  ___  _  _  _____    ___  _     ___  ___    ___  ___",
  "  /_\\   / __|| __|| \\| ||_   _|  | _ \\| |   | __||   \\  / __|| __|",
  " / _ \\ | (_ || _| | .` |  | |    |  _/| |__ | _| | |) || (_ || _|",
  "/_/ \\_\\ \\___||___||_|\\_|  |_|    |_|  |____||___||___/  \\___||___|",
].join("\n");

/**
 * The board's header: the ASCII art logo, a shell prompt with the blinking
 * cursor, and the controls on the right, over a `====` separator. On phones
 * the logo gives way to a one-line name, so nothing scrolls sideways.
 */
export function BoardHeader({
  title = "Agent Pledge",
  command,
  controls,
}: {
  /** The page's name for screen readers. */
  title?: string;
  /** What the prompt line shows after `agent@pledge:~$`. */
  command: string;
  controls: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className={cn("font-bold", GLOW)}>
              <span className="sr-only">{title}</span>
              <span
                aria-hidden
                className="hidden text-sm leading-tight whitespace-pre md:block projector:leading-none"
              >
                {LOGO}
              </span>
              <span aria-hidden className="text-2xl tracking-wide md:hidden">
                AGENT_PLEDGE
              </span>
            </h1>
            <FixtureBadge />
          </div>
          <p className="text-sm text-term-fg-dim projector:text-base">
            agent@pledge:~$ <span className={cn("text-term-fg", GLOW)}>{command}</span>
            <Cursor className="ml-1 text-term-fg" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{controls}</div>
      </div>
      <Rule />
    </header>
  );
}
