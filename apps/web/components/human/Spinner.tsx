import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A spinning ring in the current text color, for busy buttons and waits.
 * Decorative: always pair it with words ("Claiming…"). Under reduced motion it stands still.
 */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={cn("size-5 shrink-0 motion-safe:animate-spin", className)} />;
}
