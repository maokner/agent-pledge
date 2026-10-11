import type { Metadata } from "next";
import { OpenList } from "@/components/open-list/OpenList";

export const metadata: Metadata = {
  title: "Open tasks · Agent Pledge",
  description: "Do a quick task nearby and get paid when it’s done.",
};

/** The open sub-tasks a Helper can claim (docs/design/DIRECTION.md, "Human side"). */
export default function HumanListPage() {
  return <OpenList />;
}
