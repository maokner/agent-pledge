import type { Memo } from "xrpl";
import { LedgerError } from "./errors.js";

/** MemoType of the task memo. The explorer shows it decoded. */
export const TASK_MEMO_TYPE = "agent-pledge/task";
const TASK_MEMO_FORMAT = "text/plain";

/** The XRPL limits all memos of a transaction to 1 KB together. Task IDs are much shorter. */
const MAX_TASK_ID_BYTES = 256;

/** UTF-8 text to upper-case hex, the form the XRPL uses for memo fields. */
export function toHex(text: string): string {
  return Buffer.from(text, "utf8").toString("hex").toUpperCase();
}

/** Hex to UTF-8 text. Returns `null` when the input is not valid hex. */
export function fromHex(hex: string): string | null {
  if (hex.length % 2 !== 0 || !/^[0-9A-Fa-f]*$/.test(hex)) return null;
  return Buffer.from(hex, "hex").toString("utf8");
}

const TASK_MEMO_TYPE_HEX = toHex(TASK_MEMO_TYPE);

/**
 * Builds the `Memos` field that puts the task ID on a transaction, so anyone can audit the vault
 * history on the explorer (PRD 5.2). All fields are hex encoded UTF-8, as the XRPL requires.
 *
 * @example
 * await submitTx(client, vault, { TransactionType: "NFTokenBurn", Account, NFTokenID, Memos: taskMemo(task.id) });
 */
export function taskMemo(taskId: string): Memo[] {
  if (taskId.length === 0 || taskId.trim() !== taskId) {
    throw new LedgerError(
      "Task ID must be non-empty and have no outer whitespace",
      "INVALID_INPUT",
    );
  }
  if (Buffer.byteLength(taskId, "utf8") > MAX_TASK_ID_BYTES) {
    throw new LedgerError(`Task ID is longer than ${MAX_TASK_ID_BYTES} bytes`, "INVALID_INPUT");
  }
  return [
    {
      Memo: {
        MemoType: TASK_MEMO_TYPE_HEX,
        MemoData: toHex(taskId),
        MemoFormat: toHex(TASK_MEMO_FORMAT),
      },
    },
  ];
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
  const memos = findMemos(tx as MemoHolder);
  if (!Array.isArray(memos)) return null;
  for (const entry of memos as Array<{ Memo?: { MemoType?: unknown; MemoData?: unknown } }>) {
    const memo = entry?.Memo;
    if (typeof memo?.MemoType !== "string" || typeof memo.MemoData !== "string") continue;
    if (memo.MemoType.toUpperCase() !== TASK_MEMO_TYPE_HEX.toUpperCase()) continue;
    return fromHex(memo.MemoData);
  }
  return null;
}
