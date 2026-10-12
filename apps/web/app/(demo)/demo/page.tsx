import type { Metadata } from "next";
import { Balances } from "@/components/demo/Balances";
import { Cast } from "@/components/demo/Cast";
import { Chapters } from "@/components/demo/Chapters";
import { DemoHero } from "@/components/demo/DemoHero";
import { Gallery } from "@/components/demo/Gallery";
import { MoneyFlow } from "@/components/demo/MoneyFlow";
import { NftCards } from "@/components/demo/NftCards";
import { TxTimeline } from "@/components/demo/TxTimeline";
import { ExplorerLink } from "@/components/demo/parts";
import { HumanShell } from "@/components/human/HumanShell";
import { EVIDENCE_URL, GENERATED_AT, NETWORK, TASK } from "@/lib/demo/walkthrough";

export const metadata: Metadata = {
  title: "Demo · yo pledge",
  description:
    "One recorded run, end to end on the XRP Ledger: a $5.00 seat reservation, an AI agent, a student on Yik Yak, two NFTs, and 15 transactions you can check on the public explorer.",
};

/**
 * /demo: the recorded run as a walkthrough for judges. Static: everything on
 * it comes from lib/demo/walkthrough (a copy of docs/evidence/task_…/evidence.json
 * and the screenshots), so it needs no server and never changes under a reader.
 */
export default function DemoPage() {
  return (
    <HumanShell current="/demo" className="flex flex-col gap-24 lg:gap-32">
      <DemoHero />
      <Cast />
      <MoneyFlow />
      <Chapters />
      <TxTimeline />
      <NftCards />
      <Balances />
      <Gallery />
      <footer className="flex flex-col gap-2 border-t border-human-border pt-8 text-sm leading-relaxed text-human-muted-fg">
        <p>
          Task {TASK.id}, read back from {NETWORK} on {GENERATED_AT.slice(0, 10)}. The raw ledger
          records, with every full signature, are in the evidence folder:{" "}
          <ExplorerLink href={EVIDENCE_URL} className="min-h-0 text-sm">
            docs/evidence on GitHub
          </ExplorerLink>
          .
        </p>
        <p>
          Dollar amounts are the USD test token on the XRPL Testnet (issuer
          r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT), shown as dollars the way the board shows them.
        </p>
      </footer>
    </HumanShell>
  );
}
