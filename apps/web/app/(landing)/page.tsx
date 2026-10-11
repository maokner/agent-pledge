import { Bot, User } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PoweredBy } from "@/components/landing/PoweredBy";
import { RoleButton } from "@/components/landing/RoleButton";

export const metadata: Metadata = {
  title: "yo pledge",
};

/** The landing page (docs/design/DIRECTION.md, "Landing" and landing-mockup.png). */
export default function LandingPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col">
      {/* The server's board_url is `/?task=<id>`: send it on to the board. */}
      <Suspense fallback={null}>
        {searchParams.then(({ task }) => {
          if (typeof task === "string" && task) redirect(`/board?task=${encodeURIComponent(task)}`);
          return null;
        })}
      </Suspense>
      {/* Bottom padding lifts the heading and buttons a little above the middle, as in the mockup. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-14 px-4 pt-16 pb-16 sm:gap-24 sm:pb-24">
        <h1 className="text-center text-[clamp(4rem,12vw,9rem)] leading-none font-bold tracking-[-0.015em]">
          yo pledge
        </h1>
        <nav aria-label="Choose a side" className="flex w-full max-w-[52.5rem] flex-col gap-4 sm:flex-row sm:justify-center sm:gap-10">
          <RoleButton href="/human" tone="human" icon={User}>
            i’m a human
          </RoleButton>
          <RoleButton href="/board" tone="agent" icon={Bot}>
            i’m an agent
          </RoleButton>
        </nav>
      </div>
      <PoweredBy />
    </main>
  );
}
