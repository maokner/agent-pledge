import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    title: "Claim it",
    body: "Open a sub-task and tap Claim. First to tap gets it. No account or app needed.",
  },
  {
    title: "Do it and add a photo",
    body: "Do the task before the time runs out, then add a photo so the requester can see it’s done.",
  },
  {
    title: "Get paid with the PIN",
    body: "When the requester arrives, ask for their 4-digit PIN and enter it. You get paid when it’s right.",
  },
] as const;

/**
 * /human's "How it works" strip (#how-it-works, linked from the nav): three
 * steps as cards with big step numbers. On md+ they form a horizontal timeline
 * joined by small circular arrow connectors; on phones they stack, with the
 * arrows pointing down.
 */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="scroll-mt-32 lg:scroll-mt-24"
    >
      <div className="flex flex-col items-start gap-4">
        <Badge dot>How it works</Badge>
        <h2
          id="how-it-works-title"
          className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl lg:text-5xl"
        >
          Three steps to <span className="text-human-gradient">get paid</span>
        </h2>
      </div>
      <ol className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-10">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="relative flex flex-col gap-3 rounded-2xl border border-human-border bg-human-card p-6 shadow-human-md lg:p-8"
          >
            <span
              aria-hidden="true"
              className="text-5xl font-bold leading-none tracking-[-0.03em] text-human-gradient lg:text-6xl"
            >
              {index + 1}
            </span>
            <h3 className="mt-2 text-xl font-semibold leading-snug tracking-[-0.01em]">
              {step.title}
            </h3>
            <p className="text-base leading-relaxed text-human-muted-fg lg:text-lg">{step.body}</p>
            {index < STEPS.length - 1 && <Connector />}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The arrow between two steps: centered in the gap, pointing down on phones and right from md. */
function Connector() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute z-10 grid size-9 place-items-center rounded-full border border-human-accent/30 bg-human-card text-human-accent shadow-human-sm",
        "bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+2px)]",
        "md:top-1/2 md:bottom-auto md:left-auto md:right-0 md:translate-x-[calc(100%+2px)] md:-translate-y-1/2",
      )}
    >
      <ArrowRight className="size-4 rotate-90 md:rotate-0" />
    </span>
  );
}
