/**
 * Builds realistic board event streams that follow the PRD's seat-hold flow
 * (sections 2.1 and 5.4), for fixture mode. The fixture snapshot is the fold
 * of these events, so seqs and states always agree.
 */
import type {
  AgentLogLevel,
  BoardEvent,
  LedgerTx,
  RlusdAmount,
  Subtask,
  Task,
  TxKind,
  XrplTxType,
} from "@agent-pledge/shared";
import { formatRlusd } from "../format";
import { FIXTURE_ADDRESSES, fakeHex, makeSubtask, makeTask } from "./factories";

const A = FIXTURE_ADDRESSES;

type EventData<T extends BoardEvent["type"]> = Extract<BoardEvent, { type: T }>["data"];

export class ScenarioBuilder {
  readonly events: BoardEvent[] = [];
  private seq: number;
  private clock: number;
  private hexSeed: number;
  private logCount = 0;
  private readonly stepMs: number;

  constructor(opts: { startSeq: number; startTime: number; stepMs?: number; hexSeed?: number }) {
    this.seq = opts.startSeq;
    this.clock = opts.startTime;
    this.stepMs = opts.stepMs ?? 1500;
    this.hexSeed = opts.hexSeed ?? opts.startSeq * 1000;
  }

  now(): string {
    return new Date(this.clock).toISOString();
  }

  /** Moves the clock without emitting anything. */
  wait(ms: number): void {
    this.clock += ms;
  }

  /** Moves the clock to an absolute time. */
  at(time: number): void {
    this.clock = time;
  }

  nextHex(): string {
    return fakeHex(this.hexSeed++);
  }

  emit<T extends BoardEvent["type"]>(type: T, data: EventData<T>): void {
    this.events.push({ type, seq: this.seq++, at: this.now(), data } as BoardEvent);
    this.clock += this.stepMs;
  }

  log(task: Task, level: AgentLogLevel, message: string, subtask?: Subtask): void {
    this.emit("agent.log", {
      line: {
        id: `log_${this.seq}_${this.logCount++}`,
        at: this.now(),
        task_id: task.id,
        subtask_id: subtask?.id ?? null,
        level,
        message,
      },
    });
  }

  /** Emits tx.pending and returns the pending tx. */
  submit(fields: {
    kind: TxKind;
    tx_type: XrplTxType;
    task: Task;
    subtask?: Subtask;
    from: string;
    to: string | null;
    amount: RlusdAmount | null;
  }): LedgerTx {
    const tx: LedgerTx = {
      hash: this.nextHex(),
      kind: fields.kind,
      tx_type: fields.tx_type,
      task_id: fields.task.id,
      subtask_id: fields.subtask?.id ?? null,
      from: fields.from,
      to: fields.to,
      amount: fields.amount,
      status: "pending",
      engine_result: null,
      ledger_index: null,
      submitted_at: this.now(),
      validated_at: null,
    };
    this.emit("tx.pending", { tx });
    return tx;
  }

  /** Emits tx.validated (tesSUCCESS), with the task or sub-task it changed if any. */
  validate(tx: LedgerTx, changed: { task?: Task; subtask?: Subtask } = {}): LedgerTx {
    const done: LedgerTx = {
      ...tx,
      status: "validated",
      engine_result: "tesSUCCESS",
      ledger_index: 11_000_000 + this.seq,
      validated_at: this.now(),
    };
    this.emit("tx.validated", { tx: done, task: changed.task ?? null, subtask: changed.subtask ?? null });
    return done;
  }
}

/** How far the seat-hold flow goes before it stops. */
export type FlowStop =
  | "escrowed" // task open: money in the vault, task NFT mint still pending
  | "posted" // task claimed; sub-task open and on Yik Yak; the NFT offer still pending
  | "seat_saved" // sub-task claimed with a photo and one wrong PIN
  | "paid" // task and sub-task done
  | "failed"; // nobody claimed in time; task and sub-task failed, money returned

export interface SeatHoldSpec {
  taskId: string;
  subtaskId: string;
  claimCode: string;
  description: string;
  place: string;
  timeLimitMinutes: number;
  price: RlusdAmount;
  stopAt: FlowStop;
  photoNote?: string;
}

const PLEDGE = "1";

function add(a: RlusdAmount, b: RlusdAmount): RlusdAmount {
  return String(Number(a) + Number(b));
}

/** 80% of the task price, rounded down to $0.50 (PRD 7.1 step 3). */
export function subtaskPrice(price: RlusdAmount): RlusdAmount {
  return String(Math.floor(Number(price) * 0.8 * 2) / 2);
}

/** Emits one task's events, from the call to `spec.stopAt`. */
export function seatHoldFlow(b: ScenarioBuilder, spec: SeatHoldSpec): void {
  const createdAt = Date.parse(b.now());
  const deadline = new Date(createdAt + spec.timeLimitMinutes * 60_000).toISOString();
  const subPrice = subtaskPrice(spec.price);

  let task = makeTask({
    id: spec.taskId,
    description: spec.description,
    place: spec.place,
    time_limit_minutes: spec.timeLimitMinutes,
    price: spec.price,
    pledge: PLEDGE,
    created_at: b.now(),
    deadline_at: deadline,
  });
  b.emit("task.created", { task });
  b.log(task, "info", `New task: "${spec.description}" for ${formatRlusd(spec.price)}, ${spec.timeLimitMinutes} min`);

  const escrow = b.submit({ kind: "task_escrow", tx_type: "Payment", task, from: A.requester, to: A.vault, amount: spec.price });
  b.validate(escrow);
  const mint = b.submit({ kind: "task_nft_mint", tx_type: "NFTokenMint", task, from: A.vault, to: null, amount: null });
  if (spec.stopAt === "escrowed") return;

  task = { ...task, nft_id: b.nextHex() };
  b.validate(mint, { task });
  const offer = b.submit({ kind: "task_nft_offer", tx_type: "NFTokenCreateOffer", task, from: A.vault, to: A.agent, amount: PLEDGE });
  b.validate(offer);

  b.log(task, "decision", `Claiming the task with a ${formatRlusd(PLEDGE)} pledge`);
  const claim = b.submit({ kind: "task_claim", tx_type: "NFTokenAcceptOffer", task, from: A.agent, to: A.vault, amount: PLEDGE });
  b.validate(claim);
  task = { ...task, status: "claimed", agent_address: A.agent, claimed_at: b.now() };
  b.emit("task.claimed", { task });

  b.log(task, "decision", `Sub-task price: ${formatRlusd(subPrice)} (80% of ${formatRlusd(spec.price)})`);
  let sub = makeSubtask({
    id: spec.subtaskId,
    task_id: task.id,
    claim_code: spec.claimCode,
    claim_url: `https://agentpledge.example/c/${spec.claimCode}`,
    description: spec.description.replace(/^Save me/, "Save"),
    place: spec.place,
    time_limit_minutes: spec.timeLimitMinutes,
    price: subPrice,
    created_at: b.now(),
    deadline_at: deadline,
  });
  const subEscrow = b.submit({ kind: "subtask_escrow", tx_type: "Payment", task, subtask: sub, from: A.agent, to: A.vault, amount: subPrice });
  task = { ...task, subtask_ids: [...task.subtask_ids, sub.id] };
  b.emit("subtask.created", { subtask: sub, task });
  b.validate(subEscrow);
  const subMint = b.submit({ kind: "subtask_nft_mint", tx_type: "NFTokenMint", task, subtask: sub, from: A.vault, to: null, amount: null });
  sub = { ...sub, nft_id: b.nextHex(), parent_nft_id: task.nft_id };
  b.validate(subMint, { subtask: sub });

  const postText = `${formatRlusd(subPrice).replace(".00", "")} to ${sub.description.charAt(0).toLowerCase()}${sub.description.slice(1)} in the next ${spec.timeLimitMinutes} min. First to claim gets it: ${sub.claim_url}`;
  b.log(task, "info", "Posting the sub-task on Yik Yak", sub);
  sub = { ...sub, yikyak_post: { text: postText, screenshot_url: "/fixtures/yikyak-screenshot.svg", posted_at: b.now() } };
  b.emit("yikyak.posted", { subtask: sub });
  const subOffer = b.submit({ kind: "subtask_nft_offer", tx_type: "NFTokenCreateOffer", task, subtask: sub, from: A.vault, to: null, amount: null });
  if (spec.stopAt === "posted") return;
  b.validate(subOffer);

  if (spec.stopAt === "failed") {
    b.at(Date.parse(deadline));
    b.log(task, "warning", "No helper claimed the sub-task in time. Returning the money.", sub);
    for (const nft of ["task", "subtask"] as const) {
      const burn = b.submit({ kind: "nft_burn", tx_type: "NFTokenBurn", task, subtask: nft === "subtask" ? sub : undefined, from: A.vault, to: null, amount: null });
      b.validate(burn);
    }
    const refund = b.submit({ kind: "requester_refund", tx_type: "Payment", task, from: A.vault, to: A.requester, amount: add(spec.price, PLEDGE) });
    const agentRefund = b.submit({ kind: "agent_refund", tx_type: "Payment", task, subtask: sub, from: A.vault, to: A.agent, amount: subPrice });
    b.validate(refund);
    b.validate(agentRefund);
    const finished_at = b.now();
    task = { ...task, status: "failed", failure_reason: "no_claim_in_time", finished_at };
    sub = { ...sub, status: "failed", failure_reason: "no_claim_in_time", finished_at };
    b.emit("task.failed", { task, subtasks: [sub] });
    return;
  }

  const helperClaim = b.submit({ kind: "subtask_claim", tx_type: "NFTokenAcceptOffer", task, subtask: sub, from: A.helper, to: A.vault, amount: null });
  b.validate(helperClaim);
  sub = { ...sub, status: "claimed", helper_address: A.helper, claimed_at: b.now() };
  b.emit("subtask.claimed", { subtask: sub });

  sub = { ...sub, photo: { url: "/fixtures/seat-photo.svg", note: spec.photoNote ?? "Front table, left side", added_at: b.now() } };
  b.emit("photo.added", { subtask: sub });
  sub = { ...sub, pin_attempts_left: sub.pin_attempts_left - 1 };
  b.emit("pin.failed", { subtask: sub });
  if (spec.stopAt === "seat_saved") return;

  b.log(task, "info", "PIN correct. Paying the helper and redeeming the task.", sub);
  const helperOffer = b.submit({ kind: "helper_payout_offer", tx_type: "NFTokenCreateOffer", task, subtask: sub, from: A.helper, to: A.vault, amount: subPrice });
  b.validate(helperOffer);
  const helperPayout = b.submit({ kind: "helper_payout", tx_type: "NFTokenAcceptOffer", task, subtask: sub, from: A.vault, to: A.helper, amount: subPrice });
  b.validate(helperPayout);
  const agentOffer = b.submit({ kind: "agent_payout_offer", tx_type: "NFTokenCreateOffer", task, from: A.agent, to: A.vault, amount: add(spec.price, PLEDGE) });
  b.validate(agentOffer);
  const agentPayout = b.submit({ kind: "agent_payout", tx_type: "NFTokenAcceptOffer", task, from: A.vault, to: A.agent, amount: add(spec.price, PLEDGE) });
  b.validate(agentPayout);
  for (const nft of ["task", "subtask"] as const) {
    const burn = b.submit({ kind: "nft_burn", tx_type: "NFTokenBurn", task, subtask: nft === "subtask" ? sub : undefined, from: A.vault, to: null, amount: null });
    b.validate(burn);
  }
  const finished_at = b.now();
  task = { ...task, status: "done", finished_at };
  sub = { ...sub, status: "done", finished_at };
  b.emit("task.paid", { task, subtasks: [sub] });
  b.log(
    task,
    "decision",
    `Done. Helper earned ${formatRlusd(subPrice)}, agent earned ${formatRlusd(String(Number(spec.price) - Number(subPrice)))}`,
  );
}
