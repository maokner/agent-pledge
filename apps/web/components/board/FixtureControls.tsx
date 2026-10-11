"use client";

import { getFixtureTransport } from "@/lib/board/get-transport";

/** Fixture mode only: buttons that simulate a dropped connection and a missed event, to exercise resync. */
export function FixtureControls() {
  const transport = getFixtureTransport();
  if (!transport) return null;
  const button =
    "rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800";
  return (
    <span className="flex gap-2">
      <button type="button" className={button} onClick={() => transport.dropConnections()}>
        Drop connection
      </button>
      <button type="button" className={button} onClick={() => transport.skipNextEvent()}>
        Skip next event
      </button>
    </span>
  );
}
