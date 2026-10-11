import Link from "next/link";
import { Badge } from "@/components/human/Badge";
import { buttonVariants } from "@/components/human/Button";
import { cn } from "@/lib/cn";

/** "Step 2 of 3" over the step's title. Claim is step 1, the photo 2, the PIN 3. */
export function StepHeading({ id, step, title }: { id: string; step: 2 | 3; title: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Badge size="sm">Step {step} of 3</Badge>
      <h2 id={id} className="text-2xl font-semibold leading-tight tracking-[-0.01em]">
        {title}
      </h2>
    </div>
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** A link to the live board, as a secondary button unless `variant` says otherwise. */
export function BoardLink({
  variant = "secondary",
  className,
  children = "See the live board",
}: {
  variant?: "secondary" | "ghost";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href="/board" className={cn(buttonVariants({ variant, size: variant === "ghost" ? "sm" : "lg" }), className)}>
      {children}
    </Link>
  );
}
