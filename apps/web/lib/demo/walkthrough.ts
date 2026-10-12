/**
 * The recorded demo run on /demo: one task, "Reserve a seat for me" at Main
 * Stacks for $5.00, end to end on the XRPL Testnet.
 *
 * The source of truth is docs/evidence/task_ibubjgka23gcd8ad (the README and
 * evidence.json, both written by `pnpm demo:evidence` from the ledger). This
 * module reads a copy of that JSON and shapes it for the page: the four
 * chapters of the story, a plain sentence for each of the 15 transactions,
 * who the five accounts are, and what the screenshots show. Nothing here is
 * computed from live data; the page is a record of what happened.
 */

import evidence from "./evidence.json";

/** The evidence folder on GitHub, for "see the raw records" links. */
export const EVIDENCE_URL =
  "https://github.com/maokner/agent-pledge/blob/main/docs/evidence/task_ibubjgka23gcd8ad/README.md";

export type Role = "requester" | "local agent" | "vault" | "helper" | "treasury";

export type TxType =
  "Payment" | "NFTokenMint" | "NFTokenCreateOffer" | "NFTokenAcceptOffer" | "NFTokenBurn";

export type TxKind =
  | "requester_funding"
  | "task_funding"
  | "task_nft_mint"
  | "task_offer"
  | "task_claim"
  | "subtask_funding"
  | "subtask_nft_mint"
  | "subtask_offer"
  | "subtask_claim"
  | "helper_redeem_offer"
  | "helper_payout"
  | "subtask_nft_burn"
  | "agent_redeem_offer"
  | "agent_payout"
  | "task_nft_burn";

export interface Memo {
  type: string;
  data: string;
}

/** One validated ledger transaction, as read back from the XRPL. */
export interface LedgerTx {
  hash: string;
  kind: TxKind;
  type: TxType;
  signer: string;
  signerRole: Role;
  destination: string | null;
  destinationRole: Role | null;
  /** The offer's price, for example "4 USD (issuer r96…)" or "0 XRP (0 drops)". */
  amount: string | null;
  /** What a payment delivered, for example "5 USD (issuer r96…)". */
  deliveredAmount: string | null;
  /** The amount as the board shows it, "$4.00", when the server recorded one. */
  boardAmount: string | null;
  nftId: string | null;
  offerId: string | null;
  flags: number;
  sequence: number;
  fee: string;
  signingPubKey: string;
  signature: string;
  result: string;
  ledgerIndex: number;
  closeTime: string;
  ctid: string;
  memos: Memo[];
  uri: string | null;
  explorerUrl: string;
}

export interface Account {
  role: Role;
  address: string;
  xrp: string;
  tokens: string[];
  nfts: string[];
  explorerUrl: string;
}

export interface NftUriData {
  id: string;
  kind: "task" | "subtask";
  description: string;
  place: string;
  price: string;
  deadline: string;
  status: string;
  nft_id: string;
  parent_task_id: string | null;
  parent_nft_id: string | null;
  board_url: string;
}

/** A screenshot in public/demo: what it is and how big the file is, for next/image. */
export interface Shot {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  /** How to frame it: a browser window or a phone. */
  frame: "browser" | "phone";
  /** What the browser frame's address bar shows, for example "/board". */
  location?: string;
}

export interface Chapter {
  /** The anchor on the page, for example "escrow". */
  id: string;
  number: 1 | 2 | 3 | 4;
  /** The small label over the title, for example "Chapter 1". */
  kicker: string;
  title: string;
  /** The paragraphs of the story, in plain words. */
  body: string[];
  /** The transactions of this chapter, in ledger order. */
  txKinds: TxKind[];
  /** The screenshots that go with it, in order. */
  shots: Shot[];
  /** One line that sums the chapter up, shown as a pull quote. */
  outcome: string;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export const TASK = evidence.task;
export const SUBTASK = evidence.task.subtasks[0]!;
export const TRANSACTIONS = evidence.transactions as LedgerTx[];
export const ACCOUNTS = evidence.accounts as Account[];
export const NFT_URI_DATA = evidence.nft_uri_data as Record<string, NftUriData>;
export const NETWORK = evidence.network;
export const EXPLORER = evidence.explorer;
export const GENERATED_AT = evidence.generated_at;

/** The ledger-close time of the first transaction: the clock starts here. */
export const RUN_START = TRANSACTIONS[0]!.closeTime;
/** The ledger-close time of the last one. */
export const RUN_END = TRANSACTIONS[TRANSACTIONS.length - 1]!.closeTime;

export const TASK_NFT_ID = TASK.nft_id;
export const SUBTASK_NFT_ID = SUBTASK.nft_id;

// ---------------------------------------------------------------------------
// Who's who
// ---------------------------------------------------------------------------

export interface Cast {
  role: Role;
  /** The name on the page, for example "Local agent". */
  name: string;
  /** What this account does in the story. */
  blurb: string;
  address: string;
  explorerUrl: string;
  /** Net change over the run in dollars, as a signed decimal string, or null when it is not part of the story. */
  net: string | null;
}

const ROLE_COPY: Record<Role, { name: string; blurb: string; net: string | null }> = {
  requester: {
    name: "Requester",
    blurb: "Calls the phone number, asks for a seat, and pays $5.00 into escrow.",
    net: "-5.00",
  },
  "local agent": {
    name: "Local agent",
    blurb:
      "The AI program. It claims the task with a $1.00 pledge, hires a helper for $4.00, and keeps $1.00.",
    net: "1.00",
  },
  vault: {
    name: "Vault",
    blurb:
      "Holds the money in escrow, mints the task NFTs, and pays out only when the PIN is right.",
    net: "0.00",
  },
  helper: {
    name: "Helper",
    blurb: "A student who sees the Yik Yak post, saves the seat, and gets $4.00 for it.",
    net: "4.00",
  },
  treasury: {
    name: "Treasury",
    blurb: "Funds the requester's test wallet before the run. Not part of the story.",
    net: null,
  },
};

/** The five accounts, story first: requester, local agent, vault, helper, then the treasury. */
export const CAST: Cast[] = (
  ["requester", "local agent", "vault", "helper", "treasury"] as const
).map((role) => {
  const account = ACCOUNTS.find((a) => a.role === role);
  if (!account) throw new Error(`evidence.json has no account for ${role}`);
  return { role, address: account.address, explorerUrl: account.explorerUrl, ...ROLE_COPY[role] };
});

export function roleName(role: Role): string {
  return ROLE_COPY[role].name;
}

// ---------------------------------------------------------------------------
// The transactions, in plain words
// ---------------------------------------------------------------------------

export interface TxCopy {
  /** A short title, for example "Requester pays into escrow". */
  title: string;
  /** One or two sentences on what it did and why it matters. */
  detail: string;
}

export const TX_COPY: Record<TxKind, TxCopy> = {
  requester_funding: {
    title: "Treasury funds the requester",
    detail:
      "Test setup: the treasury sends the requester's wallet $5.00 so it can pay for the task.",
  },
  task_funding: {
    title: "Requester pays $5.00 into escrow",
    detail:
      "The money leaves the requester and sits in the vault. The memo names the task, so the payment and the task are tied together on the ledger.",
  },
  task_nft_mint: {
    title: "Vault mints the task NFT",
    detail:
      "One NFT per task. Its URI points to the task data below. Whoever holds this NFT holds the only right to the payout.",
  },
  task_offer: {
    title: "Vault offers the NFT to the agent for a $1.00 pledge",
    detail:
      "A sell offer with a destination: only the local agent can accept it, and only by paying the pledge.",
  },
  task_claim: {
    title: "Agent accepts and pays the pledge",
    detail:
      "One atomic transaction: the $1.00 pledge moves to the vault and the task NFT moves to the agent. Nobody else can claim it now.",
  },
  subtask_funding: {
    title: "Agent pays $4.00 for the sub-task",
    detail:
      "The agent delegates the physical work. It funds a sub-task with 80% of the price; the memo carries the sub-task ID.",
  },
  subtask_nft_mint: {
    title: "Vault mints the sub-task NFT",
    detail:
      "A second NFT, with a parent-nft memo that names the task NFT. The chain of delegation is on the ledger.",
  },
  subtask_offer: {
    title: "Vault opens the sub-task to anyone",
    detail:
      "A sell offer with no destination and a price of zero: the first wallet to accept gets the NFT and the job.",
  },
  subtask_claim: {
    title: "Helper claims the sub-task",
    detail:
      "The helper tapped Claim on their phone. A wallet was made for them behind the scenes; no app, no seed shown. A second phone would get tecOBJECT_NOT_FOUND: the offer is gone.",
  },
  helper_redeem_offer: {
    title: "Helper offers the NFT back for $4.00",
    detail:
      "After the correct PIN, the helper's wallet offers the sub-task NFT to the vault at the sub-task price.",
  },
  helper_payout: {
    title: "Vault pays the helper $4.00",
    detail:
      "The vault accepts: the NFT comes back and $4.00 goes to the helper in one atomic swap. The helper sees Paid $4.00.",
  },
  subtask_nft_burn: {
    title: "Vault burns the sub-task NFT",
    detail: "The sub-task is closed. The NFT cannot be reused.",
  },
  agent_redeem_offer: {
    title: "Agent offers the task NFT back for $6.00",
    detail:
      "The server tells the agent the sub-task is paid. The agent asks for the task price plus its pledge back.",
  },
  agent_payout: {
    title: "Vault pays the agent $6.00",
    detail:
      "The vault accepts: $5.00 for the task and the $1.00 pledge returned. After paying $4.00 to the helper, the agent nets $1.00.",
  },
  task_nft_burn: {
    title: "Vault burns the task NFT",
    detail: "The task is closed. The vault holds no NFT and no money for this task.",
  },
};

export type TxTypeLabel = "Payment" | "Mint" | "Offer" | "Accept" | "Burn";

/** The short word for a transaction type, for a pill: "NFTokenCreateOffer" -> "Offer". */
export function typeLabel(type: TxType): TxTypeLabel {
  switch (type) {
    case "Payment":
      return "Payment";
    case "NFTokenMint":
      return "Mint";
    case "NFTokenCreateOffer":
      return "Offer";
    case "NFTokenAcceptOffer":
      return "Accept";
    case "NFTokenBurn":
      return "Burn";
  }
}

const TOKEN_AMOUNT = /^(\d+(?:\.\d+)?) USD\b/;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * The dollar amount a transaction moved or priced, as the board shows it:
 * "5 USD (issuer r96…)" -> "$5.00", "0 XRP (0 drops)" -> "Free". Null when
 * the transaction moved no money (a mint or a burn).
 */
export function amountLabel(
  tx: Pick<LedgerTx, "amount" | "deliveredAmount" | "boardAmount">,
): string | null {
  const raw = tx.deliveredAmount ?? tx.amount;
  if (raw !== null) {
    if (/^0 XRP\b/.test(raw)) return "Free";
    const match = TOKEN_AMOUNT.exec(raw);
    if (match) return usd.format(Number(match[1]));
  }
  return tx.boardAmount;
}

/** Seconds from the start of the run to a ledger close, as "+0:09" or "+3:38". */
export function elapsedLabel(closeTime: string, start: string = RUN_START): string {
  const seconds = Math.max(0, Math.round((Date.parse(closeTime) - Date.parse(start)) / 1000));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `+${m}:${s}`;
}

/** "3 min 38 s" for the whole run. */
export function durationLabel(start: string = RUN_START, end: string = RUN_END): string {
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** "23:26:42 UTC" for a ledger close. */
export function clockLabel(closeTime: string): string {
  return `${closeTime.slice(11, 19)} UTC`;
}

/** The sub-task's NFT or the task's: which of the two an NFT ID is. */
export function nftName(nftId: string): "Task NFT" | "Sub-task NFT" | "NFT" {
  if (nftId === TASK_NFT_ID) return "Task NFT";
  if (nftId === SUBTASK_NFT_ID) return "Sub-task NFT";
  return "NFT";
}

export function txByKind(kind: TxKind): LedgerTx {
  const tx = TRANSACTIONS.find((t) => t.kind === kind);
  if (!tx) throw new Error(`evidence.json has no ${kind} transaction`);
  return tx;
}

/** 1-based position in the run, as the evidence README numbers them. */
export function txNumber(tx: LedgerTx): number {
  return TRANSACTIONS.indexOf(tx) + 1;
}

// ---------------------------------------------------------------------------
// Screenshots (public/demo, copied from docs/evidence/.../screenshots)
// ---------------------------------------------------------------------------

export const SHOTS = {
  boardOpen: {
    src: "/demo/01-board-open-subtask.png",
    location: "/board",
    width: 1920,
    height: 1455,
    alt: "The live board with the task Reserve a seat for me, the money tree, and an open sub-task for a helper.",
    caption: "The board right after the call: task claimed, sub-task open, Yik Yak post up.",
    frame: "browser",
  },
  boardProjectorOpen: {
    src: "/demo/02-board-projector-open.png",
    location: "/board?projector=1",
    width: 1920,
    height: 1080,
    alt: "The board in big-screen mode while the sub-task is still open.",
    caption: "Big-screen mode, the view the room sees.",
    frame: "browser",
  },
  claimOpen: {
    src: "/demo/03-claim-open.png",
    width: 390,
    height: 1116,
    alt: "The claim page on a phone: Pay $4.00, Reserve a seat for me, Main Stacks, and a Claim button.",
    caption: "The claim link from Yik Yak, on a phone.",
    frame: "phone",
  },
  claimClaimed: {
    src: "/demo/04-claim-claimed.png",
    width: 390,
    height: 1348,
    alt: "The claim page after claiming: It is yours, with a Take a photo button.",
    caption: "Claimed. The helper is asked for a photo.",
    frame: "phone",
  },
  claimPhoto: {
    src: "/demo/05-claim-photo.png",
    width: 390,
    height: 1362,
    alt: "The claim page with the seat photo attached and a note, ready to send.",
    caption: "Photo and note attached.",
    frame: "phone",
  },
  boardPhoto: {
    src: "/demo/06-board-photo.png",
    location: "/board?projector=1",
    width: 1920,
    height: 1080,
    alt: "The board in big-screen mode showing the helper's photo and note.",
    caption: "The photo lands on the board seconds later.",
    frame: "browser",
  },
  claimWrongPin: {
    src: "/demo/07-claim-wrong-pin.png",
    width: 390,
    height: 1441,
    alt: "The claim page after a wrong PIN: Wrong PIN, 2 tries left.",
    caption: "A wrong PIN first: two tries left, no money moves.",
    frame: "phone",
  },
  claimPaid: {
    src: "/demo/08b-claim-paid-fullpage.png",
    width: 390,
    height: 1078,
    alt: "The claim page showing Paid $4.00 with a View payment button.",
    caption: "The right PIN: Paid $4.00.",
    frame: "phone",
  },
  explorerPayout: {
    src: "/demo/09-explorer-helper-payout.png",
    location: "testnet.xrpl.org/transactions/5843314F…DAE888C8",
    width: 1440,
    height: 900,
    alt: "The XRPL testnet explorer page for the helper payout transaction.",
    caption: "View payment opens the payout on the public explorer.",
    frame: "browser",
  },
  boardPaid: {
    src: "/demo/10-board-paid.png",
    location: "/board",
    width: 1920,
    height: 1827,
    alt: "The board after payout: task done, money tree green, the helper and the agent paid.",
    caption: "The board at the end: both NFTs burned, everyone paid.",
    frame: "browser",
  },
  boardProjectorPaid: {
    src: "/demo/11-board-projector-paid.png",
    location: "/board?projector=1",
    width: 1920,
    height: 1080,
    alt: "The board in big-screen mode after payout, with the PIN marked correct.",
    caption: "Big-screen mode at the end.",
    frame: "browser",
  },
  boardTransactions: {
    src: "/demo/12-board-transactions.png",
    location: "/board",
    width: 1920,
    height: 2167,
    alt: "The board with every transaction expanded.",
    caption: "All 15 transactions on the board, each with an explorer link.",
    frame: "browser",
  },
  humanList: {
    src: "/demo/13-human-list.png",
    location: "/human",
    width: 1440,
    height: 900,
    alt: "The open tasks page with no open tasks left.",
    caption: "The open-tasks page afterwards: nothing left to claim.",
    frame: "browser",
  },
} as const satisfies Record<string, Shot>;

export const HELPER_PHOTO = {
  src: "/demo/helper-photo.jpg",
  width: 1200,
  height: 900,
  alt: "The helper's photo: a seat at Main Stacks with a blue backpack on it.",
};

export const YIKYAK_POST = {
  src: "/demo/yikyak-post.jpg",
  width: 420,
  height: 268,
  alt: "The Yik Yak post: I'll pay $4 if you reserve a seat for me at Main Stacks in the next 20 min. First to claim gets it.",
};

/** The gallery, in the order the run happened. */
export const GALLERY: Shot[] = [
  SHOTS.boardOpen,
  SHOTS.boardProjectorOpen,
  SHOTS.claimOpen,
  SHOTS.claimClaimed,
  SHOTS.claimPhoto,
  SHOTS.boardPhoto,
  SHOTS.claimWrongPin,
  SHOTS.claimPaid,
  SHOTS.explorerPayout,
  SHOTS.boardPaid,
  SHOTS.boardProjectorPaid,
  SHOTS.boardTransactions,
  SHOTS.humanList,
];

// ---------------------------------------------------------------------------
// The four chapters
// ---------------------------------------------------------------------------

export const CHAPTERS: Chapter[] = [
  {
    id: "escrow",
    number: 1,
    kicker: "Chapter 1",
    title: "The task becomes an NFT in escrow",
    body: [
      "The requester calls and asks for a seat at Main Stacks within 20 minutes for $5.00. The vault takes the $5.00 and mints one NFT for the task. Whoever holds that NFT holds the only right to the payout.",
      "The vault offers the NFT to the local agent alone, for a $1.00 pledge. The agent accepts and pays the pledge in a single atomic transaction. From here the vault holds the money and the agent holds the task.",
    ],
    txKinds: ["task_funding", "task_nft_mint", "task_offer", "task_claim"],
    shots: [SHOTS.boardOpen],
    outcome: "Money in the vault. Task NFT with the agent. Nobody else can claim it.",
  },
  {
    id: "delegate",
    number: 2,
    kicker: "Chapter 2",
    title: "The agent hires a helper on Yik Yak",
    body: [
      "The agent cannot sit in a chair. It pays $4.00 of the $5.00 into the vault for a sub-task, and the vault mints a second NFT whose memo names the parent task NFT. The delegation chain is on the ledger.",
      "This time the sell offer has no destination and no price. The agent posts the claim link on Yik Yak: first to claim gets it.",
    ],
    txKinds: ["subtask_funding", "subtask_nft_mint", "subtask_offer"],
    shots: [SHOTS.boardProjectorOpen],
    outcome: "A $4.00 sub-task, open to the first student who taps Claim.",
  },
  {
    id: "claim",
    number: 3,
    kicker: "Chapter 3",
    title: "A student claims it and sends a photo",
    body: [
      "A helper opens the link on their phone and taps Claim. A wallet is made for them behind the scenes, with no app and no seed to copy, and it accepts the open offer. A second phone would be told the offer is gone.",
      "The helper saves the seat, takes a photo, and adds a note. Both show up on the board within seconds.",
    ],
    txKinds: ["subtask_claim"],
    shots: [SHOTS.claimOpen, SHOTS.claimClaimed, SHOTS.claimPhoto, SHOTS.boardPhoto],
    outcome: "Seat saved: Main Stacks, 2nd floor, by the window, blue backpack on it.",
  },
  {
    id: "payout",
    number: 4,
    kicker: "Chapter 4",
    title: "The PIN releases the money",
    body: [
      "The requester walks to the seat and says the 4-digit PIN. A wrong PIN first: two tries left, nothing moves. Then the right one. The helper's wallet offers the sub-task NFT back to the vault for $4.00, and the vault accepts: NFT back, $4.00 out, in one atomic swap.",
      "That unlocks the parent. The agent offers the task NFT back for $5.00 plus its $1.00 pledge, the vault pays $6.00, and burns both NFTs. Requester −$5.00, helper +$4.00, agent +$1.00.",
    ],
    txKinds: [
      "helper_redeem_offer",
      "helper_payout",
      "subtask_nft_burn",
      "agent_redeem_offer",
      "agent_payout",
      "task_nft_burn",
    ],
    shots: [SHOTS.claimWrongPin, SHOTS.claimPaid, SHOTS.explorerPayout, SHOTS.boardPaid],
    outcome: "Requester has a seat. Helper earned $4.00. Agent earned $1.00. Both NFTs burned.",
  },
];

export function chapterTxs(chapter: Chapter): LedgerTx[] {
  return chapter.txKinds.map(txByKind);
}

/** The chapter a transaction belongs to, or null for setup (the treasury funding). */
export function chapterOf(tx: LedgerTx): Chapter | null {
  return CHAPTERS.find((c) => c.txKinds.includes(tx.kind)) ?? null;
}

// ---------------------------------------------------------------------------
// The NFTs
// ---------------------------------------------------------------------------

export interface NftStory {
  name: "Task NFT" | "Sub-task NFT";
  id: string;
  explorerUrl: string;
  uriData: NftUriData;
  /** Its six transactions: mint, offer, accept, offer back, accept back, burn. */
  txs: LedgerTx[];
}

export const NFTS: NftStory[] = [
  {
    name: "Task NFT",
    id: TASK_NFT_ID,
    explorerUrl: TASK.nft_explorer_url,
    uriData: NFT_URI_DATA[TASK.id]!,
    txs: TRANSACTIONS.filter((t) => t.nftId === TASK_NFT_ID),
  },
  {
    name: "Sub-task NFT",
    id: SUBTASK_NFT_ID,
    explorerUrl: SUBTASK.nft_explorer_url,
    uriData: NFT_URI_DATA[SUBTASK.id]!,
    txs: TRANSACTIONS.filter((t) => t.nftId === SUBTASK_NFT_ID),
  },
];

/** "1 USD (issuer r96…)" -> "$1.00", for the final balances. */
export function tokenBalance(tokens: string[]): string {
  const match = tokens[0] ? TOKEN_AMOUNT.exec(tokens[0]) : null;
  return match ? usd.format(Number(match[1])) : "$0.00";
}
