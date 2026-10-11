/**
 * Projector mode for the board (#43): how it is turned on, and which task
 * gets the big card. See apps/web/README.md, "Projector mode".
 */
import type { TaskView } from "./selectors";

export interface ProjectorMode {
  on: boolean;
  /** What to save in localStorage ("1" or "0"), or null to leave it alone. */
  remember: "1" | "0" | null;
}

/** localStorage key for the remembered choice, so the projector laptop stays in projector mode across reloads. */
export const PROJECTOR_STORAGE_KEY = "agent-pledge:projector";

// A bare `?projector` counts as on.
const ON = new Set(["1", "on", "true", ""]);
const OFF = new Set(["0", "off", "false"]);

/** `?projector=...` from the page URL, then the remembered choice, then off. */
export function projectorModeFrom(search: string, stored: string | null): ProjectorMode {
  const query = new URLSearchParams(search).get("projector");
  if (query !== null && ON.has(query)) return { on: true, remember: "1" };
  if (query !== null && OFF.has(query)) return { on: false, remember: "0" };
  return { on: stored === "1", remember: null };
}

export interface ProjectorFocus {
  /** The task in the big card, or null on an empty board. */
  focus: TaskView | null;
  /** The other tasks, as small cards, in board order (newest first). */
  others: TaskView[];
}

/**
 * Which task gets the big card on the projector: the one the operator picked
 * (`pinnedId`) if it is still on the board, else the newest, which in the
 * demo is the task the judge just phoned in. The small cards show the
 * rest, tasks still running first. `views` is newest first (selectTaskViews).
 */
export function projectorFocus(views: TaskView[], pinnedId: string | null): ProjectorFocus {
  const focus = views.find((v) => v.task.id === pinnedId) ?? views[0] ?? null;
  const rest = views.filter((v) => v !== focus);
  const running = (v: TaskView) => v.task.status === "open" || v.task.status === "claimed";
  return { focus, others: [...rest.filter(running), ...rest.filter((v) => !running(v))] };
}
