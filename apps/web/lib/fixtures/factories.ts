/**
 * Factories for contract objects with sensible defaults. Used by the fixture
 * data and by tests. Every field can be overridden.
 */
import {
  MAX_PIN_ATTEMPTS,
  type AgentLogLine,
  type LedgerTx,
  type Subtask,
  type Task,
} from "@agent-pledge/shared";

/** Well-formed-looking but fake XRPL addresses for fixtures. */
export const FIXTURE_ADDRESSES = {
  vault: "rVau1tPLEDGEvau1tPLEDGEvau1tXYZ12",
  requester: "rReqUEsterDEMOreqUEsterDEMOabc34",
  agent: "rAgentLoCALagentLoCALagentLoCAL56",
  helper: "rHe1perWALLEThe1perWALLEThe1per78",
} as const;

/** Deterministic fake 64-character hex string (for tx hashes and NFT IDs). */
export function fakeHex(seed: number): string {
  let x = (seed * 2654435761) >>> 0 || 1;
  let out = "";
  while (out.length < 64) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out += x.toString(16).toUpperCase().padStart(8, "0");
  }
  return out.slice(0, 64);
}

const T0 = "2026-10-11T19:00:00.000Z";

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "tsk_test",
    kind: "seat_hold",
    description: "Save me a seat at the front table",
    place: "Main Stacks, front table",
    time_limit_minutes: 3,
    price: "5",
    pledge: "1",
    status: "open",
    created_at: T0,
    deadline_at: "2026-10-11T19:03:00.000Z",
    claimed_at: null,
    finished_at: null,
    requester_address: FIXTURE_ADDRESSES.requester,
    agent_address: null,
    nft_id: null,
    subtask_ids: [],
    failure_reason: null,
    ...overrides,
  };
}

export function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  const claim_code = overrides.claim_code ?? "7Q2K";
  return {
    id: "sub_test",
    task_id: "tsk_test",
    claim_code,
    claim_url: `https://agentpledge.example/c/${claim_code}`,
    description: "Save a seat at the front table",
    place: "Main Stacks, front table",
    time_limit_minutes: 3,
    price: "4",
    status: "open",
    created_at: T0,
    deadline_at: "2026-10-11T19:03:00.000Z",
    claimed_at: null,
    finished_at: null,
    nft_id: null,
    parent_nft_id: null,
    helper_address: null,
    photo: null,
    yikyak_post: null,
    pin_attempts_left: MAX_PIN_ATTEMPTS,
    pin_locked: false,
    failure_reason: null,
    ...overrides,
  };
}

export function makeTx(overrides: Partial<LedgerTx> = {}): LedgerTx {
  return {
    hash: fakeHex(1),
    kind: "task_escrow",
    tx_type: "Payment",
    task_id: "tsk_test",
    subtask_id: null,
    from: FIXTURE_ADDRESSES.requester,
    to: FIXTURE_ADDRESSES.vault,
    amount: "5",
    status: "pending",
    engine_result: null,
    ledger_index: null,
    submitted_at: T0,
    validated_at: null,
    ...overrides,
  };
}

export function makeLogLine(overrides: Partial<AgentLogLine> = {}): AgentLogLine {
  return {
    id: "log_test",
    at: T0,
    task_id: null,
    subtask_id: null,
    level: "info",
    message: "Received task",
    ...overrides,
  };
}
