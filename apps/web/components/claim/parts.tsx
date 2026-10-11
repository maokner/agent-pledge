import Link from "next/link";

/** Full-width, thumb-sized primary action. */
export const PRIMARY_BUTTON =
  "flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 text-2xl font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-600/60";

/** Full-width secondary action. */
export const SECONDARY_BUTTON =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-zinc-300 bg-white px-5 text-lg font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800";

/** A quiet text button that is still easy to tap. */
export const TEXT_BUTTON =
  "inline-flex min-h-12 items-center justify-center px-3 text-base font-semibold text-zinc-700 underline underline-offset-4 hover:text-zinc-950 disabled:opacity-60 dark:text-zinc-300 dark:hover:text-white";

export const CARD = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900";

export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** An error the helper can act on, with an optional action button. */
export function ErrorNotice({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-rose-50 p-4 text-lg text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-800">
      <p>{message}</p>
      {action}
    </div>
  );
}

/** "Step 2 of 3" over the step's title. Claim is step 1, the photo 2, the PIN 3. */
export function StepHeading({ id, step, title }: { id: string; step: 2 | 3; title: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Step {step} of 3</p>
      <h2 id={id} className="text-2xl font-bold leading-tight">
        {title}
      </h2>
    </div>
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function BoardLink({ className = SECONDARY_BUTTON, children = "See the live board" }: { className?: string; children?: React.ReactNode }) {
  return (
    <Link href="/board" className={className}>
      {children}
    </Link>
  );
}
