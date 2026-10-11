import { explorerAccountUrl, explorerNftUrl, explorerTxUrl, shortHash } from "@/lib/format";

type Target = { tx: string } | { account: string } | { nft: string };

/**
 * A link to the XRPL explorer. Shows a shortened hash, address or NFT ID,
 * or `label` in its place (the full value stays in the tooltip).
 */
export function ExplorerLink(props: Target & { className?: string; label?: string }) {
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
      className={`underline decoration-dotted underline-offset-2 hover:decoration-solid ${props.label ? "" : "font-mono"} ${props.className ?? ""}`}
    >
      {props.label ?? shortHash(value)}
    </a>
  );
}
