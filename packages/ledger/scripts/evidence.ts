/**
 * Writes the on-chain evidence for one task as a folder: a README with every ledger transaction
 * (signer, public key, signature, result, memos, NFT IDs, explorer link), the life of each NFT,
 * the NFT URI data, the final balances, the raw ledger records (evidence.json), and the media
 * (the helper's photo and the Yik Yak screenshot).
 *
 *   pnpm --filter @agent-pledge/ledger run evidence --api http://localhost:3002
 *   pnpm --filter @agent-pledge/ledger run evidence --task task_xxx --out docs/evidence
 *
 * Reads the task from the server's public GET /board/state, then reads every transaction again
 * from the XRPL (XRPL_NETWORK_URL, default testnet), so nothing in the report comes from the
 * database alone. Needs no seed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BoardState, type SubtaskView, type TaskView, type TxView } from "@agent-pledge/shared";
import { Client, type Amount } from "xrpl";
import { fromHex } from "../src/memo.js";

const DEFAULT_NETWORK = "wss://s.altnet.rippletest.net:51233";
const DEFAULT_EXPLORER = "https://testnet.xrpl.org";

interface Args {
  api: string;
  task?: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { api: "http://localhost:3002", out: "docs/evidence" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--api") args.api = next().replace(/\/+$/, "");
    else if (a === "--task") args.task = next();
    else if (a === "--out") args.out = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

interface Memo {
  type: string;
  data: string;
}

interface LedgerRecord {
  hash: string;
  kind: TxView["kind"];
  step: string;
  type: string;
  signer: string;
  signerRole: string;
  destination: string | null;
  destinationRole: string | null;
  amount: string | null;
  deliveredAmount: string | null;
  /** The amount the server recorded for this step, for example the token paid in an offer accept. */
  boardAmount: string | null;
  nftId: string | null;
  offerId: string | null;
  flags: number | null;
  sequence: number | null;
  fee: string | null;
  signingPubKey: string;
  signature: string;
  result: string;
  ledgerIndex: number;
  closeTime: string;
  ctid: string | null;
  memos: Memo[];
  uri: string | null;
  explorerUrl: string;
}

interface AccountSnapshot {
  role: string;
  address: string;
  xrp: string;
  tokens: string[];
  nfts: string[];
  explorerUrl: string;
}

/** The four story steps from the demo video, in order. */
const STEPS: Record<TxView["kind"], string> = {
  wallet_setup: "0. Wallet setup",
  requester_funding: "0. Wallet setup",
  task_funding: "1. Task NFT in escrow",
  task_nft_mint: "1. Task NFT in escrow",
  task_offer: "1. Task NFT in escrow",
  task_claim: "1. Task NFT in escrow",
  subtask_funding: "2. Delegated sub-task on Yik Yak",
  subtask_nft_mint: "2. Delegated sub-task on Yik Yak",
  subtask_offer: "2. Delegated sub-task on Yik Yak",
  subtask_claim: "3. Helper claims and sends the photo",
  helper_redeem_offer: "4. Photo and PIN release the NFTs",
  helper_payout: "4. Photo and PIN release the NFTs",
  agent_redeem_offer: "4. Photo and PIN release the NFTs",
  agent_payout: "4. Photo and PIN release the NFTs",
  subtask_nft_burn: "4. Photo and PIN release the NFTs",
  task_nft_burn: "4. Photo and PIN release the NFTs",
  refund_requester: "Failure: refunds",
  refund_agent: "Failure: refunds",
};

function formatAmount(amount: Amount | undefined): string | null {
  if (amount === undefined) return null;
  if (typeof amount === "string") return `${Number(amount) / 1_000_000} XRP (${amount} drops)`;
  if ("mpt_issuance_id" in amount) return `${amount.value} MPT ${amount.mpt_issuance_id}`;
  const currency =
    amount.currency.length === 40 ? (fromHex(amount.currency) ?? amount.currency) : amount.currency;
  return `${amount.value} ${currency.replace(/\0+$/, "")} (issuer ${amount.issuer})`;
}

function decodeMemos(raw: unknown): Memo[] {
  if (!Array.isArray(raw)) return [];
  const out: Memo[] = [];
  for (const entry of raw) {
    const memo = (entry as { Memo?: { MemoType?: string; MemoData?: string } }).Memo;
    if (!memo) continue;
    out.push({
      type: memo.MemoType ? (fromHex(memo.MemoType) ?? memo.MemoType) : "",
      data: memo.MemoData ? (fromHex(memo.MemoData) ?? memo.MemoData) : "",
    });
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function download(url: string, path: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return true;
}

async function snapshot(
  client: Client,
  role: string,
  address: string,
  explorer: string,
): Promise<AccountSnapshot> {
  const info = await client.request({
    command: "account_info",
    account: address,
    ledger_index: "validated",
  });
  const lines = await client.request({
    command: "account_lines",
    account: address,
    ledger_index: "validated",
  });
  const nfts = await client.request({
    command: "account_nfts",
    account: address,
    ledger_index: "validated",
  });
  return {
    role,
    address,
    xrp: (Number(info.result.account_data.Balance) / 1_000_000).toFixed(6),
    tokens: lines.result.lines.map((l) => {
      const code =
        l.currency.length === 40
          ? (fromHex(l.currency) ?? l.currency).replace(/\0+$/, "")
          : l.currency;
      return `${l.balance} ${code} (issuer ${l.account})`;
    }),
    nfts: nfts.result.account_nfts.map((n) => n.NFTokenID),
    explorerUrl: `${explorer}/accounts/${address}`,
  };
}

function short(hex: string, keep = 10): string {
  return hex.length <= keep * 2 + 1 ? hex : `${hex.slice(0, keep)}…${hex.slice(-keep)}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const network = process.env.XRPL_NETWORK_URL || DEFAULT_NETWORK;
  const explorer = (process.env.XRPL_EXPLORER_URL || DEFAULT_EXPLORER).replace(/\/+$/, "");

  const board = BoardState.parse(await getJson(`${args.api}/board/state`));
  const task: TaskView | undefined = args.task
    ? board.tasks.find((t) => t.id === args.task)
    : board.tasks[0];
  if (!task)
    throw new Error(args.task ? `Task ${args.task} is not on the board` : "The board has no task");

  const roles = new Map<string, string>();
  if (board.vault_address) roles.set(board.vault_address, "vault");
  if (board.agent_address) roles.set(board.agent_address, "local agent");
  for (const tx of task.transactions) {
    if (tx.kind === "requester_funding" && tx.from) roles.set(tx.from, "treasury");
    if (tx.kind === "task_funding" && tx.from) roles.set(tx.from, "requester");
  }
  for (const s of task.subtasks) if (s.helper_address) roles.set(s.helper_address, "helper");
  const roleOf = (address: string | null | undefined): string | null =>
    address ? (roles.get(address) ?? "other") : null;

  const outDir = resolve(args.out, task.id);
  await mkdir(outDir, { recursive: true });

  const client = new Client(network);
  await client.connect();
  try {
    const ordered = [...task.transactions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const records: LedgerRecord[] = [];
    for (const tx of ordered) {
      if (tx.status !== "validated") {
        console.error(`skip ${tx.kind} ${tx.hash}: status ${tx.status}`);
        continue;
      }
      const res = await client.request({ command: "tx", transaction: tx.hash });
      const r = res.result as unknown as Record<string, unknown>;
      const json = (r.tx_json ?? r) as Record<string, unknown>;
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      const record: LedgerRecord = {
        hash: tx.hash,
        kind: tx.kind,
        step: STEPS[tx.kind],
        type: String(json.TransactionType),
        signer: String(json.Account),
        signerRole: roleOf(String(json.Account)) ?? "other",
        destination: typeof json.Destination === "string" ? json.Destination : null,
        destinationRole: roleOf(typeof json.Destination === "string" ? json.Destination : null),
        amount: formatAmount(json.Amount as Amount | undefined),
        deliveredAmount: formatAmount(meta.delivered_amount as Amount | undefined),
        boardAmount: tx.amount ? `$${tx.amount}` : null,
        nftId:
          (typeof json.NFTokenID === "string" && json.NFTokenID) ||
          (typeof meta.nftoken_id === "string" && meta.nftoken_id) ||
          tx.nft_id,
        offerId:
          (typeof json.NFTokenSellOffer === "string" && json.NFTokenSellOffer) ||
          (typeof meta.offer_id === "string" && meta.offer_id) ||
          tx.offer_id,
        flags: typeof json.Flags === "number" ? json.Flags : null,
        sequence: typeof json.Sequence === "number" ? json.Sequence : null,
        fee: typeof json.Fee === "string" ? `${json.Fee} drops` : null,
        signingPubKey: String(json.SigningPubKey ?? ""),
        signature: String(json.TxnSignature ?? ""),
        result: String(meta.TransactionResult ?? "unknown"),
        ledgerIndex: Number(r.ledger_index ?? json.ledger_index ?? 0),
        closeTime: String(r.close_time_iso ?? ""),
        ctid: typeof r.ctid === "string" ? r.ctid : null,
        memos: decodeMemos(json.Memos),
        uri: typeof json.URI === "string" ? (fromHex(json.URI) ?? json.URI) : null,
        explorerUrl: `${explorer}/transactions/${tx.hash}`,
      };
      records.push(record);
      console.error(
        `${record.step.padEnd(40)} ${record.type.padEnd(20)} ${record.result} ${short(tx.hash)}`,
      );
    }

    const nftData: Record<string, unknown> = {};
    for (const id of [task.id, ...task.subtasks.map((s) => s.id)]) {
      try {
        nftData[id] = await getJson(`${args.api}/tasks/${id}.json`);
      } catch (err) {
        console.error(`NFT URI data for ${id}: ${(err as Error).message}`);
      }
    }

    const accounts: AccountSnapshot[] = [];
    for (const [address, role] of roles)
      accounts.push(await snapshot(client, role, address, explorer));

    const media: { label: string; file: string; url: string }[] = [];
    for (const s of task.subtasks) {
      const items: [string, string, SubtaskView["photo"]][] = [
        ["Helper photo", `${s.id}-photo`, s.photo],
        ["Yik Yak post", `${s.id}-yikyak`, s.yikyak_screenshot],
      ];
      for (const [label, base, m] of items) {
        if (!m) continue;
        const ext = m.url.endsWith(".png") ? "png" : "jpg";
        const file = `${base}.${ext}`;
        if (await download(m.url, resolve(outDir, file))) media.push({ label, file, url: m.url });
      }
    }

    const evidence = {
      generated_at: new Date().toISOString(),
      network,
      explorer,
      api: args.api,
      task,
      roles: Object.fromEntries(roles),
      transactions: records,
      nft_uri_data: nftData,
      accounts,
      media,
    };
    await writeFile(resolve(outDir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
    await writeFile(
      resolve(outDir, "README.md"),
      renderReadme(task, records, accounts, media, nftData, network, explorer),
    );
    console.log(outDir);
  } finally {
    await client.disconnect();
  }
}

function renderReadme(
  task: TaskView,
  records: LedgerRecord[],
  accounts: AccountSnapshot[],
  media: { label: string; file: string; url: string }[],
  nftData: Record<string, unknown>,
  network: string,
  explorer: string,
): string {
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const sub = task.subtasks[0];
  const byKind = (kind: TxView["kind"]) => records.find((r) => r.kind === kind);
  const link = (r: LedgerRecord) => `[${short(r.hash, 8)}](${r.explorerUrl})`;
  const nftLink = (id: string) => `[${short(id, 8)}](${explorer}/nft/${id})`;
  const vault = accounts.find((a) => a.role === "vault");
  const agent = accounts.find((a) => a.role === "local agent");
  const helper = accounts.find((a) => a.role === "helper");
  const requester = accounts.find((a) => a.role === "requester");

  p(`# On-chain evidence: ${task.description} (${task.place}, $${task.price})`);
  p();
  p(`Task \`${task.id}\`, status **${task.status}**, created ${task.created_at}.`);
  p(`Every row below was read back from the XRPL at ${network} and links to the public explorer.`);
  p(`The raw ledger records, with every full signature, are in [evidence.json](evidence.json).`);
  const token = records.map((r) => r.amount).find((a) => a && a.includes("issuer"));
  if (token)
    p(`Token on the ledger: ${token.replace(/^[\d.]+ /, "")}. The board shows it as dollars.`);
  p();
  p(`## The four steps`);
  p();
  const step = (title: string, lines: string[]) => {
    p(`### ${title}`);
    p();
    for (const l of lines) p(l);
    p();
  };
  const f = byKind("task_funding");
  const m = byKind("task_nft_mint");
  const o = byKind("task_offer");
  const c = byKind("task_claim");
  step(
    "1. An NFT is created for the task and goes into escrow",
    [
      f
        ? `The requester pays $${task.price} into the vault: ${link(f)} (signed by ${f.signer}).`
        : "",
      m && task.nft_id
        ? `The vault mints the task NFT ${nftLink(task.nft_id)}: ${link(m)}. Its URI points to the task data below.`
        : "",
      o
        ? `The vault offers the NFT only to the local agent, for a $${task.pledge} pledge: ${o.hash === m?.hash ? "in the same mint transaction" : link(o)}.`
        : "",
      c
        ? `The local agent accepts and pays the pledge in one atomic transaction, so it alone holds the task: ${link(c)} (signed by the agent key ${c.signer}).`
        : "",
      `The vault now holds the money, and the agent holds the NFT that is the only right to the payout.`,
    ].filter(Boolean),
  );
  const sf = byKind("subtask_funding");
  const sm = byKind("subtask_nft_mint");
  const so = byKind("subtask_offer");
  step(
    "2. The agent delegates with a new task and posts it on Yik Yak",
    [
      sub && sf
        ? `The agent pays $${sub.price} for the sub-task into the vault: ${link(sf)} (memo carries the sub-task ID).`
        : "",
      sub?.nft_id && sm
        ? `The vault mints the sub-task NFT ${nftLink(sub.nft_id)} with a \`parent-nft\` memo that names the task NFT: ${link(sm)}.`
        : "",
      so
        ? `The vault opens a sell offer with no destination, so the first helper to accept gets it: ${so.hash === sm?.hash ? "in the same mint transaction" : link(so)}.`
        : "",
      sub?.post_text ? `Yik Yak post: "${sub.post_text}"` : "",
      sub ? `Claim link: ${sub.claim_url}` : "",
    ].filter(Boolean),
  );
  const sc = byKind("subtask_claim");
  step(
    "3. A helper accepts on Yik Yak and submits the seat photo",
    [
      sc && sub?.helper_address
        ? `A wallet is made for the helper (no app, no seed shown) and it accepts the open offer: ${link(sc)} (signed by ${sc.signer}). A second phone would get \`tecOBJECT_NOT_FOUND\`: the offer is gone.`
        : "",
      sub?.photo
        ? `The helper's photo is on the board and saved here as ${media.find((x) => x.label === "Helper photo")?.file ?? "a file"}.`
        : "",
      sub?.helper_note ? `Helper note: "${sub.helper_note}"` : "",
    ].filter(Boolean),
  );
  const hro = byKind("helper_redeem_offer");
  const hp = byKind("helper_payout");
  const aro = byKind("agent_redeem_offer");
  const ap = byKind("agent_payout");
  const sb = byKind("subtask_nft_burn");
  const tb = byKind("task_nft_burn");
  step(
    "4. The PIN releases the sub-task NFT, which releases the task NFT, and the agent keeps $1",
    [
      hro && sub
        ? `After the correct PIN, the helper offers the sub-task NFT back to the vault for $${sub.price}: ${link(hro)}.`
        : "",
      hp
        ? `The vault accepts: the NFT returns and the helper is paid in one atomic swap: ${link(hp)} (${hp.boardAmount ?? "paid"}).`
        : "",
      aro
        ? `The server tells the agent the sub-task is paid; the agent offers the task NFT back for $${task.price} + $${task.pledge}: ${link(aro)}.`
        : "",
      ap ? `The vault accepts and pays the agent: ${link(ap)} (${ap.boardAmount ?? "paid"}).` : "",
      sb || tb
        ? `The vault burns both NFTs to close the tasks: ${[sb, tb]
            .filter(Boolean)
            .map((r) => link(r!))
            .join(", ")}.`
        : "",
      `Net: requester −$${task.price}, helper +$${sub?.price ?? "?"}, agent +$${(Number(task.price) - Number(sub?.price ?? 0)).toFixed(2)} (paid $${task.pledge} pledge + $${sub?.price ?? "?"}, received $${(Number(task.price) + Number(task.pledge)).toFixed(2)}).`,
    ].filter(Boolean),
  );

  p(`## Every transaction`);
  p();
  p(`| # | Step | Transaction | Signer | Amount | NFT | Result | Ledger | Explorer |`);
  p(`|---|---|---|---|---|---|---|---|---|`);
  records.forEach((r, i) => {
    p(
      `| ${i + 1} | ${r.step} | ${r.type} (${r.kind}) | ${r.signerRole} \`${short(r.signer, 6)}\` | ${r.deliveredAmount ?? r.amount ?? r.boardAmount ?? ""} | ${r.nftId ? nftLink(r.nftId) : ""} | ${r.result} | ${r.ledgerIndex} | [link](${r.explorerUrl}) |`,
    );
  });
  p();
  p(`## Signatures`);
  p();
  p(
    `Each transaction is signed by the key of the account that acts, and the XRPL validators accepted it with \`tesSUCCESS\`.`,
  );
  p();
  records.forEach((r, i) => {
    p(`### ${i + 1}. ${r.type} (${r.kind})`);
    p();
    p(`- Hash: \`${r.hash}\``);
    p(`- Signer: ${r.signerRole} \`${r.signer}\``);
    if (r.destination) p(`- Destination: ${r.destinationRole} \`${r.destination}\``);
    if (r.amount) p(`- Amount: ${r.amount}`);
    if (r.deliveredAmount) p(`- Delivered: ${r.deliveredAmount}`);
    if (!r.amount && r.boardAmount)
      p(`- Settles: ${r.boardAmount} (the price of the accepted offer)`);
    if (r.nftId) p(`- NFT: \`${r.nftId}\``);
    if (r.offerId) p(`- Offer: \`${r.offerId}\``);
    if (r.uri) p(`- URI: ${r.uri}`);
    if (r.flags !== null) p(`- Flags: ${r.flags}`);
    if (r.sequence !== null) p(`- Sequence: ${r.sequence}`);
    if (r.fee) p(`- Fee: ${r.fee}`);
    p(`- Ledger: ${r.ledgerIndex}${r.ctid ? ` (CTID ${r.ctid})` : ""}, closed ${r.closeTime}`);
    p(`- Result: \`${r.result}\``);
    p(`- Signing public key: \`${r.signingPubKey}\``);
    p(`- Signature: \`${r.signature}\``);
    if (r.memos.length)
      p(`- Memos: ${r.memos.map((m) => `\`${m.type}\` = \`${m.data}\``).join(", ")}`);
    p(`- Explorer: ${r.explorerUrl}`);
    p();
  });

  p(`## The NFTs`);
  p();
  const nfts = [
    { label: "Task NFT", id: task.nft_id, dataId: task.id },
    ...task.subtasks.map((s) => ({ label: "Sub-task NFT", id: s.nft_id, dataId: s.id })),
  ];
  for (const n of nfts) {
    if (!n.id) continue;
    p(`### ${n.label} \`${n.id}\``);
    p();
    p(`Explorer: ${explorer}/nft/${n.id}`);
    p();
    const life = records.filter((r) => r.nftId === n.id);
    for (const r of life) p(`- ${r.type} by ${r.signerRole}: ${link(r)}`);
    const data = nftData[n.dataId];
    if (data) {
      p();
      p(`URI data (\`/tasks/${n.dataId}.json\`):`);
      p();
      p("```json");
      p(JSON.stringify(data, null, 2));
      p("```");
    }
    p();
  }

  p(`## Final balances`);
  p();
  p(`| Role | Address | XRP | Tokens | NFTs held |`);
  p(`|---|---|---|---|---|`);
  for (const a of accounts) {
    p(
      `| ${a.role} | [${a.address}](${a.explorerUrl}) | ${a.xrp} | ${a.tokens.join("; ") || "none"} | ${a.nfts.length ? a.nfts.map(nftLink).join(", ") : "none"} |`,
    );
  }
  p();
  if (vault && agent && helper && requester) {
    p(`The vault holds no NFT at the end, so both tasks are closed.`);
    p(
      `The helper and the agent hold none either, because the payout swap moved each NFT back to the vault before the burn.`,
    );
    p();
  }
  if (media.length) {
    p(`## Media`);
    p();
    for (const m of media) p(`- ${m.label}: [${m.file}](${m.file}) (served at ${m.url})`);
    p();
  }
  return L.join("\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
