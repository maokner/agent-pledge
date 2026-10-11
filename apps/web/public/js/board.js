// The public board: GET /board/state, then /ws/board snapshot + live events (docs/api.md 4).
// ?demo=1 renders the bundled fixture without a server. ?task=<id> scrolls to one task.
import { applyMessage, emptyState } from "./board-state.js";
import {
  clockTime,
  esc,
  formatCountdown,
  mediaSrc,
  money,
  msLeft,
  shortAddr,
  signedUsd,
  usd,
} from "./common.js";
import { moneyTree } from "./money-tree.js";

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
const FOCUS_TASK = params.get("task");

const $tasks = document.getElementById("tasks");
const $log = document.getElementById("log");
const $conn = document.getElementById("conn");
const $connText = document.getElementById("conn-text");
const $addresses = document.getElementById("addresses");
const $lightbox = document.getElementById("lightbox");
const $lightboxImg = document.getElementById("lightbox-img");
const $lightboxCaption = document.getElementById("lightbox-caption");

let state = emptyState();
let focused = false;

const TX_LABELS = {
  wallet_setup: "Wallet setup",
  requester_funding: "Requester funded",
  task_funding: "Price into vault",
  task_nft_mint: "Task NFT minted",
  task_offer: "Task NFT offer to agent",
  task_claim: "Agent claims task, pays pledge",
  subtask_funding: "Sub-task money into vault",
  subtask_nft_mint: "Sub-task NFT minted",
  subtask_offer: "Sub-task NFT offer",
  subtask_claim: "Helper claims sub-task NFT",
  helper_redeem_offer: "Helper redeems NFT",
  helper_payout: "Vault pays helper",
  agent_redeem_offer: "Agent redeems task NFT",
  agent_payout: "Vault pays agent",
  task_nft_burn: "Task NFT burned",
  subtask_nft_burn: "Sub-task NFT burned",
  refund_requester: "Refund to requester",
  refund_agent: "Refund to agent",
};
const REFUND_KINDS = new Set(["refund_requester", "refund_agent"]);

// ---------------------------------------------------------------- rendering

const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;

function countdown(task) {
  if (task.status === "done")
    return `<span class="when when-done">Done ${clockTime(task.done_at ?? task.paid_at ?? task.created_at)}</span>`;
  if (task.status === "failed") return "";
  return `<span class="when countdown num" data-deadline="${esc(task.deadline)}">${formatCountdown(msLeft(task.deadline))}</span>`;
}

function holder(task) {
  const sub = task.subtasks.find((s) => s.helper_address);
  if (task.status === "failed") return esc(task.fail_reason || "Failed");
  if (task.status === "done")
    return `Done. Helper ${esc(shortAddr(sub?.helper_address))} saved it.`;
  if (sub && sub.status === "done") {
    return `Helper <span class="mono">${esc(shortAddr(sub.helper_address))}</span> paid. Agent redeeming.`;
  }
  if (sub && sub.status === "claimed") {
    return `Helper <span class="mono">${esc(shortAddr(sub.helper_address))}</span> is on it`;
  }
  if (task.status === "claimed") {
    return `Local agent <span class="mono">${esc(shortAddr(task.agent_address))}</span> pledged ${money(task.pledge)}`;
  }
  return "Waiting for the local agent";
}

function pinLine(task) {
  const p = task.pin;
  if (p.verified) return `<span class="pin pin-ok">PIN verified</span>`;
  if (p.locked) return `<span class="pin pin-bad">PIN locked</span>`;
  if (p.attempts > 0) {
    return `<span class="pin pin-warn">Wrong PIN x${p.attempts}, ${p.attempts_left} left</span>`;
  }
  return "";
}

function renderTree(task) {
  const { rows, result } = moneyTree(task);
  const rowHtml = rows
    .map((r) => {
      const cls = `edge edge-${r.state}${r.refund ? " edge-refund" : ""}`;
      const icon =
        r.state === "pending"
          ? `<span class="spinner"></span>`
          : r.state === "ok" || r.state === "half"
            ? "&#10003;"
            : r.state === "failed"
              ? "&#10007;"
              : "";
      return `<li class="${cls}">
        <span class="edge-from">${esc(r.from)}</span>
        <span class="edge-arrow"><span class="edge-amount num">${r.cents == null ? "-" : usd(r.cents)}</span></span>
        <span class="edge-to">${esc(r.to)}</span>
        <span class="edge-what">${esc(r.what)}</span>
        <span class="edge-icon">${icon}</span>
      </li>`;
    })
    .join("");
  const party = (name, p) => `<div class="party ${p.cents > 0 ? "up" : p.cents < 0 ? "down" : ""}">
      <div class="party-name">${name}</div>
      <div class="party-amount num">${signedUsd(p.cents)}</div>
      <div class="party-text">${esc(p.text)}</div>
    </div>`;
  return `<div class="tree">
    <h3 class="section-title">Money tree</h3>
    <ol class="edges">${rowHtml}</ol>
    <div class="results ${result.final ? "final" : ""}">
      ${party("Requester", result.requester)}
      ${party("Local agent", result.agent)}
      ${party("Helper", result.helper)}
    </div>
  </div>`;
}

function renderSubtask(task, s) {
  const helper = s.helper_address
    ? `<div class="sub-meta">Helper <span class="mono">${esc(shortAddr(s.helper_address))}</span></div>`
    : "";
  const note = s.helper_note
    ? `<div class="sub-note">&ldquo;${esc(s.helper_note)}&rdquo;</div>`
    : "";
  const link =
    s.status === "open"
      ? `<a class="claim-link mono" href="${esc(s.claim_url)}" target="_blank" rel="noopener">${esc(s.claim_url.replace(/^https?:\/\//, ""))}</a>`
      : "";
  return `<div class="subtask">
    <div class="sub-head">
      <span class="sub-label">Sub-task</span>
      <span class="sub-code mono">${esc(s.claim_code)}</span>
      <span class="sub-price num">${money(s.price)}</span>
      ${badge(s.status)}
      ${pinLine(task)}
    </div>
    ${link}${helper}${note}
  </div>`;
}

function renderMedia(task) {
  const items = [];
  for (const s of task.subtasks) {
    if (s.yikyak_screenshot) {
      items.push({ m: s.yikyak_screenshot, label: "Yik Yak post", caption: s.post_text });
    }
    if (s.photo) items.push({ m: s.photo, label: "Helper photo", caption: s.helper_note });
  }
  if (!items.length) return "";
  return `<div class="media">${items
    .map(
      (
        it,
      ) => `<figure class="thumb" data-full="${esc(mediaSrc(it.m))}" data-caption="${esc(it.caption || it.label)}">
        <img src="${esc(mediaSrc(it.m))}" alt="${esc(it.label)}" loading="lazy" />
        <figcaption>${esc(it.label)}</figcaption>
      </figure>`,
    )
    .join("")}</div>`;
}

function renderTxs(task) {
  if (!task.transactions.length) return `<div class="muted">No ledger transactions yet</div>`;
  const rows = task.transactions
    .map((t) => {
      const st =
        t.status === "pending"
          ? `<span class="tx-st tx-pending"><span class="spinner"></span> pending</span>`
          : t.status === "failed"
            ? `<span class="tx-st tx-failed">failed</span>`
            : `<span class="tx-st tx-ok">&#10003; validated</span>`;
      const amount = t.amount != null && t.amount !== "0.00" ? money(t.amount) : "";
      const cls = REFUND_KINDS.has(t.kind) ? " tx-refund" : "";
      return `<li class="tx${cls}">
        <span class="tx-kind">${esc(TX_LABELS[t.kind] || t.kind)}</span>
        <span class="tx-amount num">${amount}</span>
        ${st}
        <a class="tx-link mono" href="${esc(t.explorer_url)}" target="_blank" rel="noopener">${esc(t.hash.slice(0, 6))}&#8599;</a>
      </li>`;
    })
    .join("");
  return `<ol class="txs">${rows}</ol>`;
}

function renderTask(task) {
  const nft = task.nft_explorer_url
    ? `<a class="nft-link" href="${esc(task.nft_explorer_url)}" target="_blank" rel="noopener">Task NFT&#8599;</a>`
    : "";
  const subs = task.subtasks.length
    ? task.subtasks.map((s) => renderSubtask(task, s)).join("")
    : `<div class="subtask subtask-none">No sub-task yet</div>`;
  return `<article class="card card-${esc(task.status)}${task.id === FOCUS_TASK ? " card-focus" : ""}" id="${esc(task.id)}">
    <div class="card-head">
      ${badge(task.status)}
      <h2 class="card-title">${esc(task.description)}</h2>
      <div class="card-price num">${money(task.price)}</div>
    </div>
    <div class="card-sub">
      <span class="place">${esc(task.place)}</span>
      ${countdown(task)}
      <span class="holder">${holder(task)}</span>
      ${nft}
    </div>
    <div class="card-body">
      <div class="col">
        ${subs}
        ${renderTree(task)}
      </div>
      <div class="col">
        ${renderMedia(task)}
        <h3 class="section-title">Ledger transactions</h3>
        ${renderTxs(task)}
      </div>
    </div>
  </article>`;
}

function renderLog() {
  const atBottom = $log.scrollHeight - $log.scrollTop - $log.clientHeight < 40;
  const entries = [...state.agent_log].reverse();
  $log.innerHTML = entries.length
    ? entries
        .map(
          (e) => `<li class="log-entry log-${esc(e.level)}">
          <span class="log-time num">${clockTime(e.at)}</span>
          <span class="log-msg">${esc(e.message)}</span>
        </li>`,
        )
        .join("")
    : `<li class="muted">No agent decisions yet</li>`;
  if (atBottom || !renderLog.done) $log.scrollTop = $log.scrollHeight;
  renderLog.done = true;
}

function render() {
  $tasks.innerHTML = state.tasks.length
    ? state.tasks.map(renderTask).join("")
    : `<div class="empty">No tasks yet. Call the Agent Pledge number to make one.</div>`;
  renderLog();
  const addr = [];
  if (state.vault_address)
    addr.push(`Vault <span class="mono">${esc(shortAddr(state.vault_address))}</span>`);
  if (state.agent_address)
    addr.push(`Agent <span class="mono">${esc(shortAddr(state.agent_address))}</span>`);
  $addresses.innerHTML = addr.join(" &middot; ");
  if (FOCUS_TASK && !focused) {
    const el = document.getElementById(FOCUS_TASK);
    if (el) {
      el.scrollIntoView({ block: "start" });
      focused = true;
    }
  }
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function tick() {
  for (const el of document.querySelectorAll("[data-deadline]")) {
    const left = msLeft(el.dataset.deadline);
    el.textContent = formatCountdown(left);
    el.classList.toggle("urgent", left < 60_000);
  }
}
setInterval(tick, 500);

// ---------------------------------------------------------------- lightbox

$tasks.addEventListener("click", (ev) => {
  const fig = ev.target.closest(".thumb");
  if (!fig) return;
  $lightboxImg.src = fig.dataset.full;
  $lightboxCaption.textContent = fig.dataset.caption || "";
  $lightbox.hidden = false;
});
$lightbox.addEventListener("click", () => {
  $lightbox.hidden = true;
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") $lightbox.hidden = true;
});

// ---------------------------------------------------------------- connection

function setConn(kind, text) {
  $conn.className = `conn conn-${kind}`;
  $connText.textContent = text;
}

function wsUrl(since) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const q = since ? `?since=${since}` : "";
  return `${proto}//${location.host}/ws/board${q}`;
}

let backoff = 500;
function connect() {
  const ws = new WebSocket(wsUrl(state.seq || 0));
  ws.onopen = () => {
    backoff = 500;
    setConn("live", "Live");
  };
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_e) {
      return;
    }
    state = applyMessage(state, msg);
    scheduleRender();
  };
  ws.onclose = () => {
    setConn("offline", "Offline");
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 8000);
  };
  ws.onerror = () => ws.close();
}

/** Moves every ISO time in the fixture forward so deadlines are in the future. */
function shiftTimes(value, deltaMs) {
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value)) {
    return new Date(Date.parse(value) + deltaMs).toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => shiftTimes(v, deltaMs));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = shiftTimes(v, deltaMs);
    if (typeof out.id === "string" && out.id.startsWith("med_")) {
      out.local_src = `/fixtures/media/${out.id}.svg`;
    }
    return out;
  }
  return value;
}

async function start() {
  if (DEMO) {
    const raw = await (await fetch("/fixtures/board-state.json")).json();
    state = shiftTimes(raw, Date.now() - Date.parse(raw.generated_at));
    setConn("demo", "Demo data");
    render();
    return;
  }
  try {
    const res = await fetch("/board/state", { cache: "no-store" });
    if (res.ok) {
      state = await res.json();
      render();
    }
  } catch (_e) {
    setConn("offline", "Offline");
  }
  connect();
}

start();
