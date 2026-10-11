import { explorerAccountUrl, explorerNftUrl, explorerTxUrl, shortHash } from "@/lib/format";

type Target = { tx: string } | { account: string } | { nft: string };

/** A link to the XRPL explorer that shows a shortened hash, address or NFT ID. */
export function ExplorerLink(props: Target & { className?: string }) {
  const [href, value] =
    "tx" in props
      ? [explorerTxUrl(props.tx), props.tx]
      : "account" in props
        ? [explorerAccountUrl(props.account), props.account]
        : [explorerNftUrl(props.nft), props.nft];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      className={`font-mono underline decoration-dotted underline-offset-2 hover:decoration-solid ${props.className ?? ""}`}
    >
      {shortHash(value)}
    </a>
  );
}
