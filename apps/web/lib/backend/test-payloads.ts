/**
 * Real-server payloads for the adapter tests, shaped exactly like
 * `origin/backend-all:apps/server/src/lib/views.ts` builds them (the PRD's
 * seat-hold example: $5 task, $1 pledge, $4 sub-task, 3 minutes).
 * Test-only; nothing in the app imports this.
 */
import type {
  BackendAgentLogEntry,
  BackendBoardState,
  BackendClaimNft,
  BackendClaimView,
  BackendMediaView,
  BackendSubtaskView,
  BackendTaskView,
  BackendTxView,
} from "./types";

export const T0 = "2026-10-11T18:00:00.000Z";
export const API = "http://localhost:3001";
export const WEB = "http://localhost:3000";

export const ADDRESSES = {
  vault: "r37hDaqXGUL574V8y91XSoktYDpc9HpPjN",
  requester: "rRequesterXXXXXXXXXXXXXXXXXXXXXXXX",
  agent: "rAgentXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  helper: "rHelperXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  treasury: "rTreasuryXXXXXXXXXXXXXXXXXXXXXXXXX",
};

export const hash = (n: number) => n.toString(16).toUpperCase().padStart(64, "0");

export const EXPLORER = "https://testnet.xrpl.org";

/** NFTokenIDs shaped like the vault's: flags 0008 (transferable), fee 0, the vault's account ID, taxon, sequence. */
export const NFT_IDS = {
  task: "000800005A0B6C2E1F3D4A5B6C7D8E9F0A1B2C3D4E5F60718D3A2E0C00000041",
  subtask: "000800005A0B6C2E1F3D4A5B6C7D8E9F0A1B2C3D4E5F6071B26F1C4A00000042",
};

export function backendClaimNft(overrides: Partial<BackendClaimNft> = {}): BackendClaimNft {
  const id = overrides.id ?? NFT_IDS.subtask;
  return {
    id,
    explorer_url: `${EXPLORER}/nft/${id}`,
    holder: "vault",
    parent_nft_id: NFT_IDS.task,
    parent_explorer_url: `${EXPLORER}/nft/${NFT_IDS.task}`,
    ...overrides,
  };
}

/**
 * The sub-task's transactions up to `upTo`, all validated, oldest first, the
 * way the claim view lists them: funding, mint, offer, claim, payout offer, payout, burn.
 */
export function backendClaimTxs(
  upTo:
    | "subtask_offer"
    | "subtask_claim"
    | "helper_redeem_offer"
    | "helper_payout"
    | "subtask_nft_burn" = "subtask_offer",
): BackendTxView[] {
  const sub = { task_id: "task_k3j9x0c2m1q8z7w4", subtask_id: "sub_a1b2c3d4e5f6g7h8" };
  const all: BackendTxView[] = [
    backendTx({
      ...sub,
      hash: hash(0x51),
      kind: "subtask_funding",
      amount: "4.00",
      from: ADDRESSES.agent,
      to: ADDRESSES.vault,
    }),
    backendTx({
      ...sub,
      hash: hash(0x52),
      kind: "subtask_nft_mint",
      amount: null,
      currency: null,
      from: ADDRESSES.vault,
      to: null,
      nft_id: NFT_IDS.subtask,
    }),
    backendTx({
      ...sub,
      hash: hash(0x53),
      kind: "subtask_offer",
      amount: "0.00",
      from: ADDRESSES.vault,
      to: null,
      nft_id: NFT_IDS.subtask,
    }),
    backendTx({
      ...sub,
      hash: hash(0x54),
      kind: "subtask_claim",
      amount: null,
      currency: null,
      from: ADDRESSES.helper,
      to: ADDRESSES.vault,
      nft_id: NFT_IDS.subtask,
    }),
    backendTx({
      ...sub,
      hash: hash(0x55),
      kind: "helper_redeem_offer",
      amount: "4.00",
      from: ADDRESSES.helper,
      to: ADDRESSES.vault,
      nft_id: NFT_IDS.subtask,
      memo: "agent-pledge/proof",
    }),
    backendTx({
      ...sub,
      hash: hash(0x56),
      kind: "helper_payout",
      amount: "4.00",
      from: ADDRESSES.vault,
      to: ADDRESSES.helper,
      nft_id: NFT_IDS.subtask,
      memo: "agent-pledge/proof",
    }),
    backendTx({
      ...sub,
      hash: hash(0x57),
      kind: "subtask_nft_burn",
      amount: null,
      currency: null,
      from: ADDRESSES.vault,
      to: null,
      nft_id: NFT_IDS.subtask,
    }),
  ];
  return all.slice(0, all.findIndex((tx) => tx.kind === upTo) + 1);
}

export function backendTx(overrides: Partial<BackendTxView> = {}): BackendTxView {
  const h = overrides.hash ?? hash(1);
  return {
    hash: h,
    kind: "task_funding",
    status: "validated",
    amount: "5.00",
    currency: "RLUSD",
    from: ADDRESSES.requester,
    to: ADDRESSES.vault,
    memo: null,
    task_id: "task_k3j9x0c2m1q8z7w4",
    subtask_id: null,
    nft_id: null,
    offer_id: null,
    explorer_url: `https://testnet.xrpl.org/transactions/${h}`,
    error: null,
    created_at: "2026-10-11T18:00:01.000Z",
    validated_at: "2026-10-11T18:00:04.000Z",
    ...overrides,
  };
}

export function backendMedia(overrides: Partial<BackendMediaView> = {}): BackendMediaView {
  const id = overrides.id ?? "med_p0p0p0p0p0p0p0p0";
  return {
    id,
    kind: "photo",
    task_id: "task_k3j9x0c2m1q8z7w4",
    subtask_id: "sub_a1b2c3d4e5f6g7h8",
    url: `${API}/media/${id}`,
    mime_type: "image/jpeg",
    width: 1280,
    height: 960,
    created_at: "2026-10-11T18:01:30.000Z",
    ...overrides,
  };
}

export function backendSubtask(overrides: Partial<BackendSubtaskView> = {}): BackendSubtaskView {
  return {
    id: "sub_a1b2c3d4e5f6g7h8",
    task_id: "task_k3j9x0c2m1q8z7w4",
    price: "4.00",
    deadline: "2026-10-11T18:03:00.000Z",
    status: "open",
    claim_code: "7Q2K",
    claim_url: `${WEB}/c/7Q2K`,
    helper_address: null,
    nft_id: null,
    nft_explorer_url: null,
    offer_id: null,
    helper_note: null,
    photo: null,
    post_text: null,
    yikyak_screenshot: null,
    yikyak_posted_at: null,
    created_at: "2026-10-11T18:00:30.000Z",
    claimed_at: null,
    done_at: null,
    failed_at: null,
    paid_at: null,
    payout_tx_hash: null,
    ...overrides,
  };
}

export function backendTask(overrides: Partial<BackendTaskView> = {}): BackendTaskView {
  return {
    id: "task_k3j9x0c2m1q8z7w4",
    board_code: "BX7M",
    description: "Save me a seat at the front table",
    place: "Main Stacks",
    time_limit_minutes: 3,
    deadline: "2026-10-11T18:03:00.000Z",
    price: "5.00",
    pledge: "1.00",
    status: "open",
    requester_address: ADDRESSES.requester,
    agent_address: ADDRESSES.agent,
    nft_id: null,
    nft_explorer_url: null,
    offer_id: null,
    created_at: T0,
    claimed_at: null,
    done_at: null,
    failed_at: null,
    fail_reason: null,
    paid_at: null,
    refunded_at: null,
    pin: { attempts: 0, attempts_left: 3, locked: false, verified: false },
    subtasks: [],
    transactions: [],
    ...overrides,
  };
}

export function backendLogEntry(
  overrides: Partial<BackendAgentLogEntry> = {},
): BackendAgentLogEntry {
  return {
    id: 1,
    at: "2026-10-11T18:00:10.000Z",
    task_id: "task_k3j9x0c2m1q8z7w4",
    subtask_id: null,
    level: "decision",
    message: "Sub-task price: $4.00 (80% of $5.00)",
    ...overrides,
  };
}

export function backendBoardState(overrides: Partial<BackendBoardState> = {}): BackendBoardState {
  return {
    seq: 1760205600000,
    generated_at: "2026-10-11T18:00:45.000Z",
    tasks: [],
    agent_log: [],
    vault_address: ADDRESSES.vault,
    agent_address: ADDRESSES.agent,
    ...overrides,
  };
}

export function backendClaim(overrides: Partial<BackendClaimView> = {}): BackendClaimView {
  return {
    code: "7Q2K",
    subtask_id: "sub_a1b2c3d4e5f6g7h8",
    task_id: "task_k3j9x0c2m1q8z7w4",
    description: "Save me a seat at the front table",
    place: "Main Stacks",
    price: "4.00",
    deadline: "2026-10-11T18:03:00.000Z",
    status: "open",
    claimed_by_you: false,
    helper_note: null,
    photo: null,
    pin: { attempts: 0, attempts_left: 3, locked: false, verified: false },
    payout: null,
    proof: "photo",
    proof_sha256: null,
    nft: backendClaimNft(),
    escrow: {
      amount: "4.00",
      vault_address: ADDRESSES.vault,
      vault_explorer_url: `${EXPLORER}/accounts/${ADDRESSES.vault}`,
    },
    transactions: backendClaimTxs("subtask_offer"),
    ...overrides,
  };
}
