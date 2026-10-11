import { Link2Off, Lock, TimerOff, UserCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { cn } from "@/lib/cn";
import { BoardLink } from "./parts";

export type ClosedReason = "already_claimed" | "expired" | "locked" | "not_found";

const MESSAGE: Record<
  ClosedReason,
  { title: string; body: string; icon: LucideIcon; tone: string }
> = {
  already_claimed: {
    title: "Already claimed",
    body: "Another Helper tapped Claim first. Only one person can hold a sub-task, so there is nothing to do here.",
    icon: UserCheck,
    tone: "text-human-muted-fg",
  },
  expired: {
    title: "Time is up",
    body: "This sub-task ended before it was finished. Nobody was paid, and the money went back to the person who asked.",
    icon: TimerOff,
    tone: "text-human-warning",
  },
  locked: {
    title: "Locked",
    body: "The PIN was wrong three times, so this sub-task is locked and will not pay out.",
    icon: Lock,
    tone: "text-human-danger",
  },
  not_found: {
    title: "This link does not work",
    body: "Check that you opened the whole link from the post. The code is the 4 characters after /c/.",
    icon: Link2Off,
    tone: "text-human-muted-fg",
  },
};

/** Why this phone cannot do the sub-task (PRD 2.3, 9.2 step 4), with a way to the board. */
export function ClaimClosed({ reason }: { reason: ClosedReason }) {
  const { title, body, icon: Icon, tone } = MESSAGE[reason];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="claim-closed-title">
      <Card className="flex flex-col items-start gap-3 sm:p-8 lg:p-10">
        <span
          aria-hidden="true"
          className={cn("grid size-14 place-items-center rounded-full bg-human-muted", tone)}
        >
          <Icon className="size-7" />
        </span>
        <h2
          id="claim-closed-title"
          className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
        >
          {title}
        </h2>
        <p className="text-lg leading-relaxed text-human-muted-fg">{body}</p>
      </Card>
      <Link href="/human" className={buttonVariants({ variant: "primary" })}>
        See other open tasks
      </Link>
      <BoardLink />
    </section>
  );
}
