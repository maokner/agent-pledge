import { decode, getNFTokenID, type TransactionMetadata } from "xrpl";

/**
 * Parsers for validated transaction metadata.
 * They take the `meta` field of a tx response, as an object or as a binary hex string.
 */
type MetaInput = TransactionMetadata | string | undefined;

interface NodeView {
  kind: "CreatedNode" | "ModifiedNode" | "DeletedNode";
  LedgerEntryType: string;
  LedgerIndex: string;
  fields: Record<string, unknown>;
}

function toObject(meta: MetaInput): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined;
  if (typeof meta === "string") return decode(meta) as Record<string, unknown>;
  return meta as unknown as Record<string, unknown>;
}

function nodes(meta: MetaInput): NodeView[] {
  const affected = toObject(meta)?.AffectedNodes;
  if (!Array.isArray(affected)) return [];
  const views: NodeView[] = [];
  for (const wrapper of affected as Record<string, unknown>[]) {
    for (const kind of ["CreatedNode", "ModifiedNode", "DeletedNode"] as const) {
      const node = wrapper[kind] as Record<string, unknown> | undefined;
      if (!node) continue;
      const fields = (node.NewFields ?? node.FinalFields ?? {}) as Record<string, unknown>;
      views.push({
        kind,
        LedgerEntryType: String(node.LedgerEntryType),
        LedgerIndex: String(node.LedgerIndex),
        fields,
      });
    }
  }
  return views;
}

/** A synthetic field that rippled 1.11+ adds to validated meta, such as nftoken_id or offer_id. */
function syntheticField(meta: MetaInput, field: "nftoken_id" | "offer_id"): string | undefined {
  const value = toObject(meta)?.[field];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The ledger index of the NFTokenOffer that an NFTokenCreateOffer made. This is the offer ID to accept.
 * Reads meta.offer_id first, then the CreatedNode with LedgerEntryType NFTokenOffer.
 */
export function getCreatedOfferId(meta: MetaInput): string | undefined {
  return (
    syntheticField(meta, "offer_id") ??
    nodes(meta).find((n) => n.kind === "CreatedNode" && n.LedgerEntryType === "NFTokenOffer")
      ?.LedgerIndex
  );
}

/**
 * The NFTokenID that an NFTokenMint made.
 * Reads meta.nftoken_id first, then xrpl.js getNFTokenID, which diffs the NFTokenPages.
 */
export function getMintedNftId(meta: MetaInput): string | undefined {
  if (meta === undefined) return undefined;
  return syntheticField(meta, "nftoken_id") ?? getNFTokenID(meta);
}

/**
 * The NFTokenID that an NFTokenAcceptOffer moved.
 * Reads meta.nftoken_id first, then the NFTokenID of the deleted NFTokenOffer.
 */
export function getAcceptedNftId(meta: MetaInput): string | undefined {
  const synthetic = syntheticField(meta, "nftoken_id");
  if (synthetic) return synthetic;
  const offer = nodes(meta).find(
    (n) => n.kind === "DeletedNode" && n.LedgerEntryType === "NFTokenOffer",
  );
  const id = offer?.fields.NFTokenID;
  return typeof id === "string" ? id : undefined;
}
