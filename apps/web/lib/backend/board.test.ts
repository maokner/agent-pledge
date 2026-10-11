import { describe, expect, it } from "vitest";
import { boardSnapshotFromBackend } from "./board";
import type { BackendTxView } from "./types";
import {
  ADDRESSES,
  backendBoardState,
  backendLogEntry,
  backendMedia,
  backendSubtask,
  backendTask,
  backendTx,
  hash,
} from "./test-payloads";

describe("boardSnapshotFromBackend (GET /board/state, and the socket's snapshot)", () => {
  it("flattens nested tasks into tasks, sub-tasks and transactions", () => {
    const sub = backendSubtask({
      status: "claimed",
      helper_address: ADDRESSES.helper,
      nft_id: "SUBNFT",
    });
    const task = backendTask({
      status: "claimed",
      nft_id: "TASKNFT",
      nft_explorer_url: "https://testnet.xrpl.org/nft/TASKNFT",
      subtasks: [sub],
      transactions: [
        backendTx({ hash: hash(1), kind: "task_funding" }),
        backendTx({
          hash: hash(2),
          kind: "subtask_claim",
          subtask_id: sub.id,
          amount: null,
          currency: null,
        }),
      ],
    });

    const snapshot = boardSnapshotFromBackend(
      backendBoardState({ seq: 1760205600042, tasks: [task] }),
    );

    expect(snapshot.seq).toBe(1760205600042);
    expect(snapshot.tasks).toEqual([
      expect.objectContaining({
        id: "task_k3j9x0c2m1q8z7w4",
        kind: "seat_hold",
        description: "Save me a seat at the front table",
        place: "Main Stacks",
        time_limit_minutes: 3,
        price: "5.00",
        pledge: "1.00",
        status: "claimed",
        created_at: "2026-10-11T18:00:00.000Z",
        deadline_at: "2026-10-11T18:03:00.000Z",
        nft_id: "TASKNFT",
        nft_explorer_url: "https://testnet.xrpl.org/nft/TASKNFT",
        subtask_ids: ["sub_a1b2c3d4e5f6g7h8"],
        failure_reason: null,
      }),
    ]);
    expect(snapshot.subtasks).toEqual([
      expect.objectContaining({
        id: "sub_a1b2c3d4e5f6g7h8",
        task_id: task.id,
        status: "claimed",
        helper_address: ADDRESSES.helper,
      }),
    ]);
    expect(snapshot.txs.map((tx) => tx.hash)).toEqual([hash(1), hash(2)]);
  });

  it("gives each sub-task its parent task's description and place, and the PIN state the task holds", () => {
    const task = backendTask({
      nft_id: "TASKNFT",
      pin: { attempts: 1, attempts_left: 2, locked: false, verified: false },
      subtasks: [
        backendSubtask({
          created_at: "2026-10-11T18:00:30.000Z",
          deadline: "2026-10-11T18:03:00.000Z",
        }),
      ],
    });

    const [sub] = boardSnapshotFromBackend(backendBoardState({ tasks: [task] })).subtasks;

    expect(sub).toMatchObject({
      description: "Save me a seat at the front table",
      place: "Main Stacks",
      // 2.5 minutes from creation to deadline, rounded up.
      time_limit_minutes: 3,
      price: "4.00",
      deadline_at: "2026-10-11T18:03:00.000Z",
      claim_code: "7Q2K",
      claim_url: "http://localhost:3000/c/7Q2K",
      parent_nft_id: "TASKNFT",
      pin_attempts_left: 2,
      pin_locked: false,
    });
  });

  it("maps the photo, the note and the Yik Yak post", () => {
    const photo = backendMedia();
    const screenshot = backendMedia({ id: "med_s0s0s0s0s0s0s0s0", kind: "yikyak_screenshot" });
    const task = backendTask({
      subtasks: [
        backendSubtask({
          status: "claimed",
          photo,
          helper_note: "Front table, left side",
          post_text: "$4 to save a seat at Main Stacks: http://localhost:3000/c/7Q2K",
          yikyak_screenshot: screenshot,
          yikyak_posted_at: "2026-10-11T18:00:50.000Z",
        }),
      ],
    });

    const [sub] = boardSnapshotFromBackend(backendBoardState({ tasks: [task] })).subtasks;

    expect(sub?.photo).toEqual({
      url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0",
      note: "Front table, left side",
      added_at: "2026-10-11T18:01:30.000Z",
      width: 1280,
      height: 960,
    });
    expect(sub?.yikyak_post).toEqual({
      text: "$4 to save a seat at Main Stacks: http://localhost:3000/c/7Q2K",
      screenshot_url: "http://localhost:3001/media/med_s0s0s0s0s0s0s0s0",
      posted_at: "2026-10-11T18:00:50.000Z",
    });
  });

  it("puts the agent log oldest first, with string IDs", () => {
    const state = backendBoardState({
      agent_log: [
        backendLogEntry({ id: 3, message: "third" }),
        backendLogEntry({ id: 2, message: "second" }),
        backendLogEntry({ id: 1, message: "first" }),
      ],
    });

    const log = boardSnapshotFromBackend(state).agent_log;

    expect(log.map((line) => [line.id, line.message])).toEqual([
      ["1", "first"],
      ["2", "second"],
      ["3", "third"],
    ]);
  });
});

describe("transactions from the real server", () => {
  const snapshotWith = (...txs: Partial<BackendTxView>[]) =>
    boardSnapshotFromBackend(
      backendBoardState({ tasks: [backendTask({ transactions: txs.map((tx) => backendTx(tx)) })] }),
    ).txs;

  it("renames the server's kinds to the board's, and adds the XRPL transaction type", () => {
    const txs = snapshotWith(
      {
        hash: hash(1),
        kind: "requester_funding",
        from: ADDRESSES.treasury,
        to: ADDRESSES.requester,
      },
      { hash: hash(2), kind: "task_funding" },
      { hash: hash(3), kind: "task_nft_mint", amount: null, currency: null },
      { hash: hash(4), kind: "task_offer", amount: "1.00" },
      { hash: hash(5), kind: "task_claim" },
      { hash: hash(6), kind: "subtask_funding" },
      { hash: hash(7), kind: "subtask_offer", amount: null },
      { hash: hash(8), kind: "helper_redeem_offer" },
      { hash: hash(9), kind: "agent_redeem_offer" },
      { hash: hash(10), kind: "task_nft_burn" },
      { hash: hash(11), kind: "subtask_nft_burn" },
      { hash: hash(12), kind: "refund_requester" },
      { hash: hash(13), kind: "refund_agent" },
    );

    expect(txs.map((tx) => [tx.kind, tx.tx_type])).toEqual([
      ["requester_funding", "Payment"],
      ["task_escrow", "Payment"],
      ["task_nft_mint", "NFTokenMint"],
      ["task_nft_offer", "NFTokenCreateOffer"],
      ["task_claim", "NFTokenAcceptOffer"],
      ["subtask_escrow", "Payment"],
      ["subtask_nft_offer", "NFTokenCreateOffer"],
      ["helper_payout_offer", "NFTokenCreateOffer"],
      ["agent_payout_offer", "NFTokenCreateOffer"],
      ["nft_burn", "NFTokenBurn"],
      ["nft_burn", "NFTokenBurn"],
      ["requester_refund", "Payment"],
      ["agent_refund", "Payment"],
    ]);
  });

  it("keeps the server's explorer link, currency and error, and uses created_at as the submit time", () => {
    const [tx] = snapshotWith({
      hash: hash(5),
      kind: "task_funding",
      status: "failed",
      error: "tecUNFUNDED_PAYMENT",
      validated_at: null,
      explorer_url: "https://testnet.xrpl.org/transactions/ABC",
    });

    expect(tx).toEqual({
      hash: hash(5),
      kind: "task_escrow",
      tx_type: "Payment",
      task_id: "task_k3j9x0c2m1q8z7w4",
      subtask_id: null,
      from: ADDRESSES.requester,
      to: ADDRESSES.vault,
      amount: "5.00",
      status: "failed",
      engine_result: "tecUNFUNDED_PAYMENT",
      ledger_index: null,
      submitted_at: "2026-10-11T18:00:01.000Z",
      validated_at: null,
      explorer_url: "https://testnet.xrpl.org/transactions/ABC",
      currency: "RLUSD",
      error: "tecUNFUNDED_PAYMENT",
    });
  });

  it("shows a status it does not know as pending, and drops what it cannot place", () => {
    const txs = snapshotWith(
      { hash: hash(1), status: "unknown" as never },
      { hash: hash(2), kind: "wallet_setup", task_id: null, amount: null },
      { hash: hash(3), kind: "escrow_create" as never },
    );

    expect(txs.map((tx) => [tx.hash, tx.status])).toEqual([[hash(1), "pending"]]);
  });

  it("leaves out XRP amounts, which are not dollars", () => {
    const [tx] = snapshotWith({ kind: "wallet_setup", amount: "10.00", currency: "XRP" });

    expect(tx).toMatchObject({
      kind: "wallet_setup",
      tx_type: "TrustSet",
      amount: null,
      currency: "XRP",
    });
  });
});

describe("a failed task", () => {
  it("keeps the server's reason as text, and the closest reason the board knows", () => {
    const task = backendTask({
      status: "failed",
      fail_reason: "No helper claimed the sub-task in time",
      failed_at: "2026-10-11T18:03:01.000Z",
      subtasks: [backendSubtask({ status: "failed", failed_at: "2026-10-11T18:03:01.000Z" })],
    });

    const snapshot = boardSnapshotFromBackend(backendBoardState({ tasks: [task] }));

    expect(snapshot.tasks[0]).toMatchObject({
      status: "failed",
      failure_reason: "no_claim_in_time",
      fail_reason: "No helper claimed the sub-task in time",
      finished_at: "2026-10-11T18:03:01.000Z",
    });
    expect(snapshot.subtasks[0]).toMatchObject({
      status: "failed",
      failure_reason: "no_claim_in_time",
    });
  });

  it("says the PIN locked it when the task's PIN is locked", () => {
    const task = backendTask({
      status: "failed",
      fail_reason: "No correct PIN before the time limit",
      pin: { attempts: 3, attempts_left: 0, locked: true, verified: false },
    });

    expect(
      boardSnapshotFromBackend(backendBoardState({ tasks: [task] })).tasks[0]?.failure_reason,
    ).toBe("pin_locked");
  });

  it("has no enum reason for text it does not recognise, but keeps the text", () => {
    const task = backendTask({ status: "failed", fail_reason: "Failed by the operator" });

    expect(boardSnapshotFromBackend(backendBoardState({ tasks: [task] })).tasks[0]).toMatchObject({
      failure_reason: null,
      fail_reason: "Failed by the operator",
    });
  });
});
