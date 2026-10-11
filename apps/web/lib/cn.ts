import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told about the custom theme in app/globals.css so it
 * resolves conflicts between our own font, shadow and text-shadow names
 * (e.g. `font-display` is a family, not a weight).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      font: ["sans", "display", "mono"],
      shadow: ["human-sm", "human-md", "human-lg", "human-xl", "human-accent", "human-accent-lg"],
      "text-shadow": ["term-glow", "term-glow-subtle"],
    },
  },
});

/** Join class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
