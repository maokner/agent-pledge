import type { Memo } from "xrpl";
import { LedgerError } from "./errors.js";

/**
 * Memo types on every Agent Pledge transaction (PRD 5.2: anyone can audit the history).
 * MemoType, MemoData, and MemoFormat are hex-encoded UTF-8 on the ledger. The explorer shows them
 * decoded on the Detailed tab of the transaction.
 */
export const MEMO_TYPES = {
  task: "agent-pledge/task",
  subtask: "agent-pledge/subtask",
  parentNft: "agent-pledge/parent-nft",
  /** What the transaction does. Values are the shared TxKind strings, for example "refund". */
  action: "agent-pledge/action",
  /** sha256 (hex) of the proof photo that released a payout. On the holder's payout offer and the vault's accept. */
  proof: "agent-pledge/proof",
} as const;

/** MemoType of the task memo. */
export const TASK_MEMO_TYPE = MEMO_TYPES.task;
const MEMO_FORMAT = "text/plain";

/** The XRPL limits all memos of a transaction to 1 KB together. IDs are much shorter. */
const MAX_ID_BYTES = 256;

export type MemoFields = { -readonly [K in keyof typeof MEMO_TYPES]?: string | undefined };

const FIELD_ORDER = Object.keys(MEMO_TYPES) as (keyof typeof MEMO_TYPES)[];

/** UTF-8 text to upper-case hex, the form the XRPL uses for memo and URI fields. */
export function toHex(text: string): string {
  return Buffer.from(text, "utf8").toString("hex").toUpperCase();
}

/** Hex to UTF-8 text. Returns `null` when the input is not valid hex. */
export function fromHex(hex: string): string | null {
  if (hex.length % 2 !== 0 || !/^[0-9A-Fa-f]*$/.test(hex)) return null;
  return Buffer.from(hex, "hex").toString("utf8");
}

/** Task and sub-task IDs: non-empty, no outer whitespace, at most 256 bytes. */
function checkId(name: string, id: string): void {
  if (id.length === 0 || id.trim() !== id) {
    throw new LedgerError(
      `${name} must be non-empty and have no outer whitespace`,
      "INVALID_INPUT",
    );
  }
  if (Buffer.byteLength(id, "utf8") > MAX_ID_BYTES) {
    throw new LedgerError(`${name} is longer than ${MAX_ID_BYTES} bytes`, "INVALID_INPUT");
  }
}

/** One memo with hex-encoded type, data, and the text/plain format. */
export function encodeMemo(type: string, data: string): Memo {
  if (!type) throw new LedgerError("Memo type must not be empty", "INVALID_INPUT");
  if (!data) throw new LedgerError(`Memo data for ${type} must not be empty`, "INVALID_INPUT");
  return { Memo: { MemoType: toHex(type), MemoData: toHex(data), MemoFormat: toHex(MEMO_FORMAT) } };
}

/**
 * Builds the memo list for a transaction, in a fixed order. Fields that are undefined are left out.
 * Throws a LedgerError with code INVALID_INPUT for an empty value, or for a task or sub-task ID with
 * outer whitespace or more than 256 bytes.
 */
export function buildMemos(fields: MemoFields): Memo[] {
  const memos: Memo[] = [];
  for (const key of FIELD_ORDER) {
    const value = fields[key];
    if (value === undefined) continue;
    if (key === "task") checkId("Task ID", value);
    if (key === "subtask") checkId("Sub-task ID", value);
    memos.push(encodeMemo(MEMO_TYPES[key], value));
  }
  return memos;
}

/**
 * Reads the Agent Pledge memo fields from a `Memos` array. Unknown or malformed memos are ignored.
 * When a type appears twice, the first one wins. Hex may be upper or lower case.
 */
export function readMemos(memos: unknown): MemoFields {
  const fields: MemoFields = {};
  if (!Array.isArray(memos)) return fields;
  for (const entry of memos as Array<{ Memo?: { MemoType?: unknown; MemoData?: unknown } }>) {
    const memo = entry?.Memo;
    if (typeof memo?.MemoType !== "string" || typeof memo.MemoData !== "string") continue;
    const type = fromHex(memo.MemoType);
    const data = fromHex(memo.MemoData);
    if (type === null || !data) continue;
    const key = FIELD_ORDER.find((k) => MEMO_TYPES[k] === type);
    if (key && fields[key] === undefined) fields[key] = data;
  }
  return fields;
}

/**
 * The `Memos` field with only the task memo, so anyone can audit the vault history (PRD 5.2).
 * The same as `buildMemos({ task: taskId })`.
 *
 * @example
 * await submitTx(client, vault, { TransactionType: "NFTokenBurn", Account, NFTokenID, Memos: taskMemo(task.id) });
 */
export function taskMemo(taskId: string): Memo[] {
  return buildMemos({ task: taskId });
}

interface MemoHolder {
  Memos?: unknown;
  tx_json?: { Memos?: unknown };
  tx?: { Memos?: unknown };
  result?: { Memos?: unknown; tx_json?: { Memos?: unknown } };
}

function findMemos(tx: MemoHolder): unknown {
  return (
    tx.Memos ?? tx.tx_json?.Memos ?? tx.tx?.Memos ?? tx.result?.tx_json?.Memos ?? tx.result?.Memos
  );
}

/**
 * Reads the task ID back from a transaction. Accepts a transaction object, a `tx` response, the
 * `result` of one, or a transaction stream message (`tx_json` or `tx`). Returns `null` when there is
 * no task memo.
 */
export function readTaskMemo(tx: object): string | null {
  return readMemos(findMemos(tx as MemoHolder)).task ?? null;
}
