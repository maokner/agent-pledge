import { ChevronDown, Layers } from "lucide-react";
import { Card } from "@/components/human/Card";
import { IconTile } from "@/components/human/IconTile";
import {
  elapsedLabel,
  NFTS,
  roleName,
  TX_COPY,
  txNumber,
  type NftStory,
} from "@/lib/demo/walkthrough";
import { formatRlusd } from "@/lib/format";
import { ExplorerLink, Hash, SectionHeading, TypePill } from "./parts";

/** The two NFTs: what each one is, its six moves, and the data its URI points to. */
export function NftCards() {
  return (
    <section id="nfts" aria-labelledby="nfts-title" className="scroll-mt-28 flex flex-col gap-10">
      <SectionHeading
        id="nfts-title"
        badge="The NFTs"
        title={
          <>
            Two tokens, <span className="text-human-gradient">one chain of custody</span>
          </>
        }
        lede="Each task is one NFT. The sub-task NFT names its parent, so the ledger itself shows who delegated to whom. Both come back to the vault and burn at the end."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {NFTS.map((nft) => (
          <NftCard key={nft.id} nft={nft} />
        ))}
      </div>
    </section>
  );
}

function NftCard({ nft }: { nft: NftStory }) {
  const { uriData } = nft;
  return (
    <Card as="article" aria-labelledby={`nft-${uriData.kind}`} className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <IconTile size="md">
          <Layers />
        </IconTile>
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id={`nft-${uriData.kind}`}
            className="text-xl font-semibold leading-snug tracking-[-0.01em]"
          >
            {nft.name} · {formatRlusd(uriData.price)}
          </h3>
          <p className="text-base text-human-muted-fg">
            “{uriData.description}” at {uriData.place}
            {uriData.parent_nft_id ? ", a sub-task of the task NFT" : ""}
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-3 rounded-xl bg-human-muted p-4">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-[0.15em] text-human-fg/70">
            NFT ID
          </dt>
          <dd>
            <Hash value={nft.id} full />
          </dd>
        </div>
        {uriData.parent_nft_id && (
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-[0.15em] text-human-fg/70">
              Parent NFT (from the mint memo)
            </dt>
            <dd>
              <Hash value={uriData.parent_nft_id} full />
            </dd>
          </div>
        )}
      </dl>

      <ol className="flex flex-col divide-y divide-human-border">
        {nft.txs.map((tx) => (
          <li key={tx.hash} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <TypePill type={tx.type} />
            <a
              href={`#tx-${txNumber(tx)}`}
              className="min-w-0 flex-1 rounded-sm text-base font-medium outline-none hover:text-human-accent focus-visible:ring-2 focus-visible:ring-human-ring"
            >
              {TX_COPY[tx.kind].title}
            </a>
            <span className="text-sm text-human-muted-fg">
              by {roleName(tx.signerRole)} · {elapsedLabel(tx.closeTime)}
            </span>
          </li>
        ))}
      </ol>

      <details className="group/uri rounded-xl border border-human-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-sm font-semibold outline-none select-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-human-ring">
          What the URI points to
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-open/uri:rotate-180"
          />
        </summary>
        <pre className="overflow-x-auto border-t border-human-border bg-human-muted px-4 py-3 font-mono text-xs leading-relaxed text-human-fg">
          {JSON.stringify(uriData, null, 2)}
        </pre>
      </details>

      <ExplorerLink href={nft.explorerUrl} className="min-h-0">
        View the NFT on the explorer
      </ExplorerLink>
    </Card>
  );
}
