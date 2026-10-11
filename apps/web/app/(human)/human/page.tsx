import type { Metadata } from "next";
import { HumanShell } from "@/components/human/HumanShell";
import { HowItWorks } from "@/components/open-list/HowItWorks";
import { OpenList } from "@/components/open-list/OpenList";
import { StatsBand } from "@/components/open-list/StatsBand";

export const metadata: Metadata = {
  title: "Open tasks · yo pledge",
  description: "Do a quick task nearby and get paid when it’s done.",
};

/**
 * The open sub-tasks a Helper can claim (docs/design/DIRECTION.md, "Human side"):
 * the title and bento grid, How it works, then the live stats band.
 */
export default function HumanListPage() {
  return (
    <HumanShell current="/human" className="flex flex-col gap-20 lg:gap-28">
      <OpenList />
      <HowItWorks />
      <StatsBand />
    </HumanShell>
  );
}
