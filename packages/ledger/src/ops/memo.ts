import { convertHexToString, convertStringToHex, type Memo } from "xrpl";

/**
 * Memo types on every Agent Pledge transaction (PRD 5.2: anyone can audit the history).
 * MemoType and MemoData are both hex-encoded UTF-8 on the ledger.
 */
export const MEMO_TYPES = {
  task: "agent-pledge/task",
  subtask: "agent-pledge/subtask",
  parentNft: "agent-pledge/parent-nft",
  /** What the transaction does. Values are the shared TxKind strings, for example "refund". */
  action: "agent-pledge/action",
} as const;

export type MemoFields = { -readonly [K in keyof typeof MEMO_TYPES]?: string | undefined };

const FIELD_ORDER = Object.keys(MEMO_TYPES) as (keyof typeof MEMO_TYPES)[];

export function encodeMemo(type: string, data: string): Memo {
  if (!type) throw new TypeError("Memo type must not be empty.");
  if (!data) throw new TypeError(`Memo data for ${type} must not be empty.`);
  return { Memo: { MemoType: convertStringToHex(type), MemoData: convertStringToHex(data) } };
}

/** Builds the memo list for a transaction. Fields that are undefined are left out. */
export function buildMemos(fields: MemoFields): Memo[] {
  const memos: Memo[] = [];
  for (const key of FIELD_ORDER) {
    const value = fields[key];
    if (value !== undefined) memos.push(encodeMemo(MEMO_TYPES[key], value));
  }
  return memos;
}

/** Reads the Agent Pledge memo fields from a transaction. Unknown or malformed memos are ignored. */
export function readMemos(memos: readonly Memo[] | undefined): MemoFields {
  const fields: MemoFields = {};
  for (const { Memo: memo } of memos ?? []) {
    if (!memo?.MemoType || !memo.MemoData) continue;
    let type: string;
    let data: string;
    try {
      type = convertHexToString(memo.MemoType);
      data = convertHexToString(memo.MemoData);
    } catch {
      continue;
    }
    const key = FIELD_ORDER.find((k) => MEMO_TYPES[k] === type);
    if (key && fields[key] === undefined) fields[key] = data;
  }
  return fields;
}
