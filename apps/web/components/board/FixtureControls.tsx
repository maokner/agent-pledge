"use client";

import { getFixtureTransport } from "@/lib/board/get-transport";
import { TermButton } from "./term";

/** Fixture mode only: buttons that simulate a dropped connection and a missed event, to exercise resync. */
export function FixtureControls() {
  const transport = getFixtureTransport();
  if (!transport) return null;
  return (
    <span className="flex flex-wrap gap-x-2">
      <TermButton
        className="text-term-amber projector:text-base"
        onClick={() => transport.dropConnections()}
      >
        DROP CONNECTION
      </TermButton>
      <TermButton
        className="text-term-amber projector:text-base"
        onClick={() => transport.skipNextEvent()}
      >
        SKIP NEXT EVENT
      </TermButton>
    </span>
  );
}
