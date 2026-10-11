import { Armchair, Beer, type LucideIcon, Palette, PenLine, Sparkles } from "lucide-react";
import { subtaskIcon, type SubtaskIconName } from "@/lib/open-list/icon";

const ICONS: Record<SubtaskIconName, LucideIcon> = {
  armchair: Armchair,
  beer: Beer,
  palette: Palette,
  "pen-line": PenLine,
  sparkles: Sparkles,
};

/** The line icon for a sub-task, picked from what it asks for (lib/open-list/icon.ts). Decorative. */
export function SubtaskIcon({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const Icon = ICONS[subtaskIcon(description)];
  return <Icon aria-hidden="true" strokeWidth={1.75} className={className} />;
}
