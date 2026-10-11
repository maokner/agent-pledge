"use client";

import { cn } from "@/lib/cn";
import { TermButton } from "./term";

/** A header button in projector mode: big enough to hit on the laptop; focus inverts it. */
export const HEADER_BUTTON = "min-h-11 text-base";

/** Switches the board between projector mode and the normal view (#43). Only shown on a big screen. */
export function ProjectorToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <TermButton
      onClick={() => onChange(!on)}
      className={cn(on ? HEADER_BUTTON : "hidden lg:inline-flex")}
    >
      {on ? "NORMAL VIEW" : "PROJECTOR MODE"}
    </TermButton>
  );
}
