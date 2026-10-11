// The helper's claim page at /c/<CODE> (README 9.2, docs/api.md 3.3).
// Flow: view -> claim -> optional photo + note -> PIN -> paid. Resumes after a reload with the
// helper token stored in localStorage (sent as a Bearer header; the same-origin cookie also works).
import { esc, formatCountdown, money, msLeft } from "./common.js";

const CODE = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "")
  .trim()
  .toUpperCase();
const TOKEN_KEY = `ap_helper_token:${CODE}`;
const SKIP_KEY = `ap_photo_skipped:${CODE}`;
const API = `/claim/${encodeURIComponent(CODE)}`;
const $app = document.getElementById("app");

let claim = null;
let view = "loading";
let pinMsg = null;
let payout = null;

// ---------------------------------------------------------------- storage

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_e) {
    // Private mode without storage: the cookie still carries the token.
  }
}

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------- API

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error || null;
    this.details = body?.details ?? null;
  }
}

async function api(path, { method = "GET", body, json } = {}) {
  const headers = {};
  const token = load(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (_e) {
    throw new ApiError(0, { error: "network", message: "No connection. Check your signal and try again." });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---------------------------------------------------------------- state

const passed = (c) => msLeft(c.deadline) <= 0;

/** Which screen to show for a ClaimView. */
function decide(c) {
  if (c.claimed_by_you) {
    if (c.payout || c.status === "done" || c.pin.verified) return "paid";
    if (c.pin.locked) return "locked";
    if (c.status === "failed" || passed(c)) return "expired";
    if (c.photo || c.helper_note || load(SKIP_KEY)) return "pin";
    return "photo";
  }
  if (c.status === "open" && !passed(c)) return "open";
  if (c.status === "failed" || (c.status === "open" && passed(c))) return "expired";
  return "taken";
}

function setClaim(c) {
  claim = c;
  if (c.payout) payout = c.payout;
  show(decide(c));
}

function show(next) {
  view = next;
  render();
}

// ---------------------------------------------------------------- views

function summary(c) {
  return `<h1 class="task-desc">${esc(c.description)}</h1>
    <div class="task-place">${esc(c.place)}</div>
    <div class="facts">
      <div>
        <div class="fact-label">You earn</div>
        <div class="pay num">${money(c.price)}</div>
      </div>
      <div class="time">
        <div class="fact-label">Time left</div>
        <div class="time-left num" data-deadline="${esc(c.deadline)}">${formatCountdown(msLeft(c.deadline))}</div>
      </div>
    </div>`;
}

/** "Photo and note sent" banner on the PIN step. */
function sentLine(c) {
  if (!c.photo && !c.helper_note) return "";
  const what = c.photo && c.helper_note ? "Photo and note sent" : c.photo ? "Photo sent" : "Note sent";
  const note = c.helper_note ? `: &ldquo;${esc(c.helper_note)}&rdquo;` : "";
  return `<div class="done-photo">&#10003; ${what}${note}</div>`;
}

const stateBlock = (icon, cls, title, text, extra = "") => `<div class="state">
    <div class="state-icon ${cls}">${icon}</div>
    <h1 class="state-title">${title}</h1>
    <p class="lead">${text}</p>
    ${extra}
  </div>`;

const waiting = (title, text) => `<div class="state">
    <div class="big-spinner"><span class="spinner"></span></div>
    <h1 class="state-title">${title}</h1>
    <p class="lead">${text}</p>
  </div>`;

const VIEWS = {
  loading: () => waiting("Loading", ""),
  notfound: () =>
    stateBlock("?", "icon-warn", "Link not found", `There is no task with the code ${esc(CODE)}. Check the link in the post.`),
  error: () =>
    stateBlock(
      "!",
      "icon-warn",
      "Something went wrong",
      esc(VIEWS.error.message || "Please try again."),
      `<div class="step"><button class="btn btn-secondary" data-action="reload">Try again</button></div>`,
    ),
  open: (c) => `${summary(c)}
    <button class="btn btn-primary" data-action="claim">Claim this</button>
    <p class="lead" style="margin-top:16px;text-align:center">First tap wins. No sign-up, no wallet needed.</p>`,
  claiming: () =>
    waiting("Reserving it for you on the XRP Ledger", "This takes about 5 to 10 seconds. Keep this page open."),
  taken: () =>
    stateBlock("&#10007;", "icon-bad", "Already claimed by someone else", "Someone tapped first. Keep an eye on Yik Yak for the next one."),
  expired: () => stateBlock("&#8987;", "icon-bad", "This one expired", "The time limit passed. No one was charged."),
  photo: (c) => `${summary(c)}
    <div class="step">
      <h2 class="step-title">It is yours. Go do it.</h2>
      <p class="step-hint">Optional: add a photo and a short note so the requester can find you.</p>
      <label class="photo-pick" id="photo-pick">
        <span id="photo-label">&#128247; Take a photo</span>
        <input id="photo-input" type="file" accept="image/*" capture="environment" />
      </label>
      <input id="note" class="field" type="text" maxlength="280" placeholder="Front table, left side" enterkeyhint="send" autocomplete="off" />
      <div id="photo-msg"></div>
      <button class="btn btn-primary" data-action="send-photo" id="send-photo">Send</button>
      <button class="btn btn-link" data-action="skip-photo">Skip</button>
    </div>`,
  uploading: () => waiting("Sending your photo", "One moment."),
  pin: (c) => `${summary(c)}
    <div class="step">
      ${sentLine(c)}
      <h2 class="step-title">Enter the PIN</h2>
      <p class="step-hint">When the requester arrives, ask them for their 4-digit PIN and type it here. You get paid right away.</p>
      ${pinMsg ? `<p class="msg ${pinMsg.cls}">${esc(pinMsg.text)}</p>` : ""}
      <input id="pin" class="pin-input num" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="----" aria-label="4-digit PIN" />
      <button class="btn btn-primary" data-action="send-pin" id="send-pin" disabled>Get paid</button>
      ${c.photo || c.helper_note ? "" : `<button class="btn btn-link" data-action="back-photo">Add a photo or note</button>`}
    </div>`,
  paying: () => waiting("Paying you on the XRP Ledger", "This takes about 5 to 10 seconds."),
  locked: () =>
    stateBlock("&#128274;", "icon-bad", "Locked", "Three wrong PINs. This task is locked and cannot be paid."),
  paid: (c) => {
    const p = payout || c.payout;
    const link = p?.explorer_url
      ? `<a class="explorer" href="${esc(p.explorer_url)}" target="_blank" rel="noopener">See the payment on the XRP Ledger &#8599;</a>`
      : "";
    return `<div class="state">
      <div class="state-icon icon-ok">&#10003;</div>
      <div class="paid-amount num">Paid ${money(p?.amount ?? c.price)}</div>
      <p class="lead">Thank you for saving the seat. The money is in your wallet on the XRP Ledger.</p>
      ${link}
    </div>`;
  },
};

function render() {
  $app.innerHTML = VIEWS[view](claim);
  if (view === "pin") {
    const pin = document.getElementById("pin");
    pin.addEventListener("input", () => {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 4);
      document.getElementById("send-pin").disabled = pin.value.length !== 4;
      if (pin.value.length === 4) sendPin();
    });
    pin.focus();
  }
  if (view === "photo") {
    document.getElementById("photo-input").addEventListener("change", previewPhoto);
    document.getElementById("note").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") sendPhoto();
    });
  }
  tick();
}

function tick() {
  for (const el of document.querySelectorAll("[data-deadline]")) {
    const left = msLeft(el.dataset.deadline);
    el.textContent = formatCountdown(left);
    el.classList.toggle("urgent", left < 60_000);
  }
  if (claim && (view === "open" || view === "photo" || view === "pin") && passed(claim)) {
    show("expired");
  }
}
setInterval(tick, 500);

// ---------------------------------------------------------------- actions

function fail(err) {
  if (err.status === 404) return show("notfound");
  if (err.status === 410 || err.code === "expired") return show("expired");
  if (err.code === "already_claimed") return show("taken");
  VIEWS.error.message = err.message;
  show("error");
}

async function refresh() {
  try {
    const c = await api("");
    if (load(TOKEN_KEY) && !c.claimed_by_you) store(TOKEN_KEY, null);
    setClaim(c);
  } catch (err) {
    fail(err);
  }
}

async function doClaim() {
  show("claiming");
  try {
    const r = await api("/claim", { method: "POST" });
    store(TOKEN_KEY, r.helper_token);
    setClaim(r.claim);
  } catch (err) {
    fail(err);
  }
}

let photoFile = null;

function previewPhoto(ev) {
  photoFile = ev.target.files?.[0] ?? null;
  if (!photoFile) return;
  const pick = document.getElementById("photo-pick");
  const old = pick.querySelector("img");
  if (old) old.remove();
  const img = document.createElement("img");
  img.alt = "Your photo";
  img.src = URL.createObjectURL(photoFile);
  pick.insertBefore(img, pick.firstChild);
  document.getElementById("photo-label").hidden = true;
}

/** Scales a phone photo down to a JPEG (max 1600 px). Also turns HEIC into JPEG on iPhone. */
async function shrink(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob || file;
  } catch (_e) {
    return file;
  }
}

async function sendPhoto() {
  const note = document.getElementById("note")?.value.trim() ?? "";
  if (!photoFile && !note) {
    document.getElementById("photo-msg").innerHTML =
      `<p class="msg msg-warn">Add a photo or a note, or tap Skip.</p>`;
    return;
  }
  const form = new FormData();
  if (note) form.append("note", note);
  if (photoFile) form.append("file", await shrink(photoFile), "photo.jpg");
  show("uploading");
  try {
    const r = await api("/photo", { method: "POST", body: form });
    photoFile = null;
    setClaim(r.claim);
  } catch (err) {
    if (err.status === 409) return refresh();
    if (err.status === 410 || err.status === 404) return fail(err);
    show("photo");
    document.getElementById("photo-msg").innerHTML = `<p class="msg msg-bad">${esc(err.message)}</p>`;
  }
}

let pinBusy = false;
async function sendPin() {
  const pin = document.getElementById("pin")?.value ?? "";
  if (pinBusy || !/^\d{4}$/.test(pin)) return;
  pinBusy = true;
  show("paying");
  try {
    const r = await api("/pin", { method: "POST", json: { pin } });
    payout = r.payout;
    pinMsg = null;
    setClaim(r.claim);
  } catch (err) {
    if (err.code === "wrong_pin") {
      const left = err.details?.attempts_left;
      pinMsg = {
        cls: "msg-bad",
        text: `Wrong PIN, ${left} attempt${left === 1 ? "" : "s"} left`,
      };
      show("pin");
    } else if (err.status === 423 || err.code === "pin_locked") {
      show("locked");
    } else if (err.status === 410 || err.status === 404) {
      fail(err);
    } else {
      pinMsg = { cls: "msg-warn", text: err.message };
      show("pin");
    }
  } finally {
    pinBusy = false;
  }
}

$app.addEventListener("click", (ev) => {
  const action = ev.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "claim") doClaim();
  else if (action === "send-photo") sendPhoto();
  else if (action === "skip-photo") {
    store(SKIP_KEY, "1");
    show("pin");
  } else if (action === "back-photo") {
    store(SKIP_KEY, null);
    show("photo");
  } else if (action === "send-pin") sendPin();
  else if (action === "reload") refresh();
});

// While the task is open, check now and then whether someone else claimed it first.
setInterval(() => {
  if (view !== "open" || document.hidden) return;
  api("")
    .then((c) => {
      claim = c;
      const next = decide(c);
      if (next !== view) show(next);
    })
    .catch(() => {});
}, 4000);

if (!/^[A-Z0-9]{3,12}$/.test(CODE)) show("notfound");
else refresh();
