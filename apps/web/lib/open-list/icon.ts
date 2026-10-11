/**
 * Which icon a sub-task's card shows, picked from what it asks for. The real
 * server only makes seat holds today; the fixtures show a mix of errands.
 * The components map each name to a Lucide icon (components/open-list/SubtaskIcon.tsx).
 */
export type SubtaskIconName = "armchair" | "beer" | "palette" | "pen-line" | "sparkles";

/** First match wins, so a seat hold stays a seat hold whatever else it mentions. */
const RULES: readonly (readonly [SubtaskIconName, RegExp])[] = [
  ["armchair", /\b(seats?|tables?|chairs?)\b/i],
  ["beer", /\b(beers?|drinks?)\b/i],
  ["palette", /\b(designs?|posters?)\b/i],
  ["pen-line", /\b(essays?|edit|editing|proofread)\b/i],
];

export function subtaskIcon(description: string): SubtaskIconName {
  return RULES.find(([, pattern]) => pattern.test(description))?.[0] ?? "sparkles";
}
