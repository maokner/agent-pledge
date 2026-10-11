"use client";

/* eslint-disable @next/next/no-img-element -- images come from the API server (uploads), not this app */
import type { IsoDateTime, LedgerTx, RlusdAmount, WorkStatus } from "@/lib/contract";
import { cva, type VariantProps } from "class-variance-authority";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FIXTURE_MODE } from "@/lib/config";
import { explorerAccountUrl, explorerNftUrl, explorerTxUrl, formatRlusd, formatTimeLeft, shortHash } from "@/lib/format";
import {
  asciiBar,
  pendingFraction,
  timeLeftFraction,
  workTag,
  wrapWithContinuation,
  type TermTag,
} from "@/lib/board/terminal";
import { useChangeCount } from "@/lib/use-change-count";
import { useNow } from "@/lib/use-now";
import { GLOW, LINK, TONE_TEXT } from "./term-style";

/*
 * Terminal building blocks for the board (docs/design/agent-design-system.md):
 * panes, status tags, bracketed buttons, ASCII bars, the blinking cursor,
 * money, countdowns, explorer links and the zoomable image. The human side
 * has its own in components/human.
 */

/** The blinking block cursor. Steady under reduced motion. */
export function Cursor({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("motion-safe:animate-term-blink", className)}>
      █
    </span>
  );
}

/** An ASCII separator line (`====`, `----`) that fills its row and never scrolls the page sideways. */
export function Rule({ char = "=", className }: { char?: string; className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden whitespace-nowrap text-term-fg-dim select-none", className)}>
      {char.repeat(400)}
    </div>
  );
}

/**
 * A terminal window: 1px border, 0 radius, and a title bar, either
 * `+--- TITLE ---+` or a solid inverted bar. `flash` plays the new-task
 * arrival flash on the title bar.
 */
export function Pane({
  title,
  titleId,
  headingLevel = 2,
  right,
  inverted = false,
  flash = false,
  className,
  bodyClassName,
  children,
  ...rest
}: {
  title: React.ReactNode;
  titleId?: string;
  headingLevel?: 2 | 3 | 4;
  /** Right side of the title bar: a status tag, a price, a button. */
  right?: React.ReactNode;
  inverted?: boolean;
  flash?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cn("relative flex min-w-0 flex-col border border-term-line bg-term-bg", className)} {...rest}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-term-line px-2 py-1",
          inverted && "bg-term-fg text-term-bg text-shadow-none",
          flash && "motion-safe:animate-term-arrive",
        )}
      >
        <Heading id={titleId} className={cn("min-w-0 font-bold tracking-wide uppercase", !inverted && GLOW)}>
          {inverted ? (
            title
          ) : (
            <>
              <span aria-hidden className="text-term-fg-dim">
                +---{" "}
              </span>
              {title}
              <span aria-hidden className="text-term-fg-dim">
                {" "}
                ---+
              </span>
            </>
          )}
        </Heading>
        {right}
      </div>
      <div className={cn("flex min-w-0 flex-col p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A `// SECTION` header inside a pane. */
export function SectionTitle({
  as: Tag = "h3",
  className,
  children,
}: {
  as?: "h3" | "h4" | "p";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag className={cn("text-sm font-bold tracking-wide text-term-fg-dim uppercase projector:text-base", className)}>
      <span aria-hidden>{"// "}</span>
      {children}
    </Tag>
  );
}

const tagSize = cva("inline-flex shrink-0 items-baseline gap-2 font-bold whitespace-nowrap uppercase", {
  variants: {
    size: {
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-2xl",
      // Projector big window: the largest status on the wall (#43).
      "2xl": "text-4xl",
    },
  },
  defaultVariants: { size: "base" },
});

/** A status as a text tag in its status color: `[OPEN]`, `[DONE]` (inverted block), `[ERR] FAILED`. */
export function StatusTag({
  tag,
  size,
  className,
  children,
}: { tag: TermTag; className?: string; children?: React.ReactNode } & VariantProps<typeof tagSize>) {
  return (
    <span className={cn(tagSize({ size }), TONE_TEXT[tag.tone], tag.tone === "done" && "px-1", className)}>
      <span>{tag.tag}</span>
      {tag.word && <span>{tag.word}</span>}
      {children}
    </span>
  );
}

/**
 * A task's or sub-task's status tag. Flashes once each time the status
 * changes while the board is open (never on first paint, never under
 * reduced motion).
 */
export function WorkStatusTag({
  status,
  size,
  className,
}: { status: WorkStatus; className?: string } & VariantProps<typeof tagSize>) {
  const changes = useChangeCount(status);
  return (
    <StatusTag
      key={changes}
      tag={workTag(status)}
      size={size}
      // [DONE] is already a solid block, so it needs no flash.
      className={cn(changes > 0 && status !== "done" && "motion-safe:animate-term-validated", className)}
    />
  );
}

export const termButton = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 font-bold whitespace-nowrap uppercase outline-none select-none active:translate-y-px disabled:cursor-wait disabled:opacity-70",
  {
    variants: {
      variant: {
        // [ VIEW TX ]: hover fills green with black text; focus inverts.
        bracket:
          "text-term-fg hover:bg-term-fg hover:text-term-bg hover:text-shadow-none focus-visible:bg-term-fg focus-visible:text-term-bg focus-visible:text-shadow-none",
        // A solid inverted block; focus flips it back to green on black.
        solid:
          "border border-term-fg bg-term-fg text-term-bg text-shadow-none hover:bg-term-fg-dim hover:border-term-fg-dim focus-visible:bg-term-bg focus-visible:text-term-fg",
      },
      size: {
        sm: "min-h-9 px-1 text-sm",
        base: "min-h-11 px-2 text-base",
      },
    },
    defaultVariants: { variant: "bracket", size: "sm" },
  },
);

/** The bracket label for a terminal button: `[ VIEW TX ]`. */
export function Bracket({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden>[</span>
      <span>{children}</span>
      <span aria-hidden>]</span>
    </>
  );
}

/** A bracketed terminal button: `[ PROJECTOR MODE ]`. */
export function TermButton({
  variant,
  size,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof termButton>) {
  return (
    <button type="button" className={cn(termButton({ variant, size }), className)} {...rest}>
      {variant === "solid" ? children : <Bracket>{children}</Bracket>}
    </button>
  );
}

/** An RLUSD amount shown as dollars. */
export function Money({ amount, className }: { amount: RlusdAmount; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatRlusd(amount)}</span>;
}

/** Live "m:ss" until a deadline. */
export function Countdown({ deadline, className }: { deadline: IsoDateTime; className?: string }) {
  const now = useNow();
  return <span className={cn("tabular-nums", className)}>{now === null ? "-:--" : formatTimeLeft(deadline, now)}</span>;
}

/** Time left as an ASCII bar and a countdown: `[||||||....] 2:31`. Amber in the last quarter. */
export function TimeLeft({
  deadline,
  limitMinutes,
  className,
  barClassName,
  width = 10,
}: {
  deadline: IsoDateTime;
  limitMinutes: number;
  className?: string;
  barClassName?: string;
  width?: number;
}) {
  const now = useNow();
  const fraction = timeLeftFraction(deadline, limitMinutes, now);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 tabular-nums", fraction < 0.25 && "text-term-amber", className)}>
      <span aria-hidden className={cn("text-sm", barClassName)}>
        {asciiBar(fraction, width)}
      </span>
      <span>{now === null ? "-:--" : formatTimeLeft(deadline, now)}</span>
    </span>
  );
}

/** A pending transaction's ASCII progress bar, filling over the usual ledger close time. */
export function PendingBar({ tx, width = 8, className }: { tx: Pick<LedgerTx, "submitted_at">; width?: number; className?: string }) {
  const now = useNow(250);
  return (
    <span aria-hidden className={cn("text-term-status-pending tabular-nums", className)}>
      {asciiBar(pendingFraction(tx.submitted_at, now), width)}
    </span>
  );
}

type Target = { tx: string } | { account: string } | { nft: string };

/**
 * A link to the XRPL explorer. Shows a shortened hash, address or NFT ID,
 * or `label` in its place (the full value stays in the tooltip). `href` is the
 * server's own explorer link, when it sent one.
 */
export function ExplorerLink(props: Target & { className?: string; label?: string; href?: string | null }) {
  const [built, value] =
    "tx" in props
      ? [explorerTxUrl(props.tx), props.tx]
      : "account" in props
        ? [explorerAccountUrl(props.account), props.account]
        : [explorerNftUrl(props.nft), props.nft];
  const href = props.href ?? built;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={value} className={cn(LINK, props.className)}>
      {props.label ?? shortHash(value)}
    </a>
  );
}

/** `[ VIEW TX ]`: a bracketed link to a transaction on the explorer. */
export function ViewTxLink({ hash, href, className }: { hash: string; href?: string | null; className?: string }) {
  return (
    <a
      href={href ?? explorerTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      title={hash}
      aria-label={`View transaction ${shortHash(hash)} on the explorer`}
      className={cn(termButton({ variant: "bracket" }), "min-h-0", className)}
    >
      <Bracket>VIEW TX</Bracket>
    </a>
  );
}

/** A long unbreakable value (a hash, an ID) wrapped in lines of `width` characters, each ending in `\`. */
export function WrapLine({ text, width = 24, className }: { text: string; width?: number; className?: string }) {
  const lines = wrapWithContinuation(text, width);
  return (
    <span className={cn("inline-block tabular-nums", className)} title={text}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line.endsWith("\\") && i < lines.length - 1 ? (
            <>
              {line.slice(0, -1)}
              <span aria-hidden className="text-term-fg-dim">
                \
              </span>
            </>
          ) : (
            line
          )}
        </span>
      ))}
    </span>
  );
}

/** `[FIXTURE DATA]` when NEXT_PUBLIC_FIXTURES=1, so nobody mistakes it for live data. */
export function FixtureBadge() {
  if (!FIXTURE_MODE) return null;
  return (
    <span className="inline-flex shrink-0 bg-term-amber px-1 text-sm font-bold tracking-wide text-term-bg uppercase text-shadow-none projector:text-base">
      [FIXTURE DATA]
    </span>
  );
}

/** A dashed box saying what the board is waiting for, with the cursor. */
export function Waiting({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex min-h-24 items-center justify-center gap-1 border border-dashed border-term-line p-3 text-center text-term-fg-dim",
        className,
      )}
    >
      <span>
        <span aria-hidden>&gt; </span>
        {children}
      </span>
      <Cursor />
    </p>
  );
}

/**
 * An image that opens full screen on tap or click, and closes on a second
 * tap, a click outside, or Escape. Shows a plain message if the image fails
 * to load, so a broken upload never breaks the board. With `fit`, the image
 * shrinks to fit the height its parent gives it (the projector layout, #43).
 */
export function ZoomableImage({ src, alt, className, fit = false }: { src: string; alt: string; className?: string; fit?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div
        className={cn(
          "flex aspect-[16/10] flex-col items-center justify-center gap-2 border border-dashed border-term-status-failed p-3 text-center text-sm text-term-status-failed",
          fit && "aspect-auto h-full",
          className,
        )}
      >
        <span>[ERR] COULD NOT LOAD THE IMAGE</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className={cn(termButton({ variant: "bracket" }), "text-term-fg")}>
          <Bracket>OPEN IT</Bracket>
        </a>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={cn(
          "group relative block w-full cursor-zoom-in overflow-hidden border border-term-line bg-term-bg outline-none hover:border-term-fg focus-visible:border-term-fg",
          fit && "h-full",
          className,
        )}
        aria-label={`Enlarge: ${alt}`}
      >
        <img src={src} alt={alt} className={cn("block w-full", fit && "h-full object-contain")} onError={() => setFailedSrc(src)} />
        <span className="absolute right-0 bottom-0 bg-term-bg px-1 text-sm font-bold text-term-fg group-hover:bg-term-fg group-hover:text-term-bg group-focus-visible:bg-term-fg group-focus-visible:text-term-bg projector:text-base">
          [ ZOOM ]
        </span>
      </button>
      <dialog
        ref={dialog}
        onClick={() => dialog.current?.close()}
        className="m-auto max-h-none max-w-none cursor-zoom-out border border-term-fg bg-term-bg p-0 backdrop:bg-term-bg/90"
        aria-label={alt}
      >
        <img src={src} alt={alt} className="h-auto max-h-[88vh] w-[96vw] max-w-6xl object-contain" />
        <p className="border-t border-term-line px-2 py-1 text-sm text-term-fg-dim">[ ESC / CLICK TO CLOSE ]</p>
      </dialog>
    </>
  );
}
