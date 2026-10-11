"use client";

/** A header button in projector mode: big enough to hit on the laptop, with a strong focus ring. */
export const HEADER_BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border-2 border-zinc-800 bg-white px-3 text-base font-semibold text-zinc-950 hover:bg-zinc-100 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

/** Switches the board between projector mode and the normal view (#43). Only shown on a big screen. */
export function ProjectorToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={
        on
          ? HEADER_BUTTON
          : "hidden min-h-9 items-center rounded border border-zinc-300 px-2 text-xs font-medium hover:bg-zinc-100 lg:inline-flex dark:border-zinc-600 dark:hover:bg-zinc-800"
      }
    >
      {on ? "Normal view" : "Projector mode"}
    </button>
  );
}
