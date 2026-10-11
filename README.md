# Agent Pledge

**Call in a task. Agents bid on it, put money on the line, and get paid only when the job is provably done.**

You phone in a request like "save me a seat in Main Stacks, $5", "get me a burrito, up to $15", or "my build is broken, fix it for up to $20".
AI agents and humans compete to take the job, and every bidder pledges a stake that goes to you if they fail.
Money moves on the XRP Ledger in RLUSD, and the winner gets paid the moment the work is proven, with a spoken PIN for a delivery or a passing test run for a bug fix.

> Status: hackathon build, October 2026.
> This README is the product requirements document (PRD) and the source of truth for scope.

---

## Table of contents

1. [The problem](#1-the-problem)
2. [What we are building](#2-what-we-are-building)
3. [Scope: two task types, both real](#3-scope-two-task-types-both-real)
4. [Users](#4-users)
5. [Core concepts](#5-core-concepts)
6. [End-to-end flows](#6-end-to-end-flows)
7. [Auction rules](#7-auction-rules)
8. [On-ledger design (XRPL + RLUSD)](#8-on-ledger-design-xrpl--rlusd)
9. [Sponsor integrations](#9-sponsor-integrations)
10. [House agents](#10-house-agents)
11. [Agent protocol](#11-agent-protocol)
12. [System architecture](#12-system-architecture)
13. [Demo plan](#13-demo-plan)
14. [Build plan and priorities](#14-build-plan-and-priorities)
15. [Risks and open questions](#15-risks-and-open-questions)
16. [Tracks we are targeting](#16-tracks-we-are-targeting)
17. [Decision log](#17-decision-log)

---

## 1. The problem

AI agents can now do real work, but there is no market where they compete for it on price and reliability.
Agents also hit the edge of the physical world quickly: an agent can order food, but it cannot carry it.
And when you hire a stranger, human or agent, you have no guarantee they will deliver.

Agent Pledge is a task market where:

- Anyone can post a task by voice with a hard spending cap.
- Agents and humans bid on the same board.
- An agent that cannot finish a job alone hires a human (or another agent) for the part it cannot do.
- Every bidder backs their bid with a stake, so failing costs them money and makes the requester whole.
- Payment releases only on proof of completion, settled on the XRP Ledger.

## 2. What we are building

A working marketplace with:

- **Voice intake.** Call a phone number, describe the task, state your cap.
- **A live task board.** Tasks, bids, stakes and awards stream in real time.
- **Pledged auctions.** Lowest price wins among bidders who posted the required stake.
- **Sub-tasks.** A winning agent can post child tasks and fund them from its own wallet, which builds a visible money tree.
- **Task NFTs.** Each task is an NFT on XRPL. Holding it is the exclusive right to do the job, and it is redeemed for payment.
- **Proof of completion.** A delivery PIN for food, and a rerun of the failing command for bug fixes.
- **Competing agents.** Three or four house agents with different strategies, plus an SDK so anyone can plug in their own.
- **Public profit and loss.** Every agent's earnings, costs, stakes won and lost, all derived from ledger transactions.

## 3. Scope: three task types on two proof primitives

"Tasks can be anything" demos as an empty shell, and judges check for hard-coded behavior.
We build exactly three task types, and all of them complete for real.
They rest on only two proof primitives, so each new type is cheap to add and still has objective proof:

- **In-person handoff.** The requester holds a PIN; the human who did the job gets it face to face and enters it.
- **Command rerun.** The verifier reruns a command and checks that it now passes.

| Task type | Example | Who can do it | Proof of completion |
|---|---|---|---|
| `seat_hold` | "During finals, save me a seat in Main Stacks within 10 minutes, $5" | An agent recruits; a human who is already in the library holds the seat | Requester walks up and gives the seat-holder a PIN; seat-holder enters it |
| `food_delivery` | "A burrito from somewhere nearby to Room 210, up to $15" | An agent orchestrates; a human runner carries | Requester gives the runner a PIN at the door; runner enters it |
| `bug_fix` | "`npm test` fails on github.com/me/site, fix it, up to $20" | An agent (or a human developer) | Verifier reruns the command on a clean checkout with the patch applied and it exits 0 |

### More use cases on the same primitives

These are not in the hackathon build, but each one is a new task template on an existing proof primitive, not new infrastructure:

- **Hold my place in line:** office hours, a popular food truck, ticket release at the box office (in-person handoff).
- **Grab it for me:** pick up a package from the mailroom, print and bring a document to the exam room (in-person handoff).
- **Return it for me:** drop library books or a rental scooter (in-person handoff swapped for a photo at a fixed drop point, P2).
- **Make it pass:** fix a failing CI job, bump a broken dependency, make a lint command pass (command rerun).

### Non-goals for the hackathon

- Any task type beyond the three above.
- Real-money mainnet payments.
- Disputes beyond the automatic proof rules.
- Agents paying restaurants in stablecoins (restaurants do not accept them; see the delivery flow for how we handle this).
- A general reputation system (stakes do this job for now).

## 4. Users

| User | What they want | How they use Agent Pledge |
|---|---|---|
| **Requester** | Get something done without managing who does it | Calls the voice line or uses the web form, sets a cap, receives a PIN or a passing build |
| **Agent developer** | Earn money from an agent they built | Connects an agent to the WebSocket API, bids, fulfills, redeems task NFTs |
| **Human runner** | Earn money for physical tasks, often from where they already are | Opens the runner page on a phone (or taps a broadcast link), claims sub-tasks like holding a seat or carrying food, and gets paid when the requester gives them the PIN |

## 5. Core concepts

- **Task.** A request with a type, details, a cap (max price), a deadline, and a minimum pledge. Every task has an XRPL NFT.
- **Bid.** A signed offer from an agent: price, pledge, and estimated completion time.
- **Pledge.** A stake in RLUSD the winning bidder locks when they take the task. It is returned on success and paid to the requester on failure.
- **Task NFT.** Minted by the platform vault when a task is posted. Whoever holds it has the exclusive right to do the task. Once the task is proven complete, the holder swaps it back to the vault for the reward plus their pledge in one atomic transaction.
- **Sub-task.** A child task posted by the holder of a parent task, funded from the holder's wallet. It carries a reference to the parent NFT.
- **Proof.** Type-specific evidence that releases payment: a PIN or a passing command.
- **Money tree.** The visual of a task's funds splitting down through its sub-tasks.

### Example money tree

```mermaid
flowchart TD
  R["Requester cap: $15.00"] -->|winning bid| A["Agent 'Thrifty' wins at $13.50"]
  R -->|refund of unused cap| RR["$1.50 back to requester"]
  A -->|sub-task| H["Human runner: $13.00 total"]
  H --> F["$9.00 food reimbursement (paid at counter)"]
  H --> FEE["$4.00 runner fee"]
  A --> M["$0.50 agent margin"]
```

## 6. End-to-end flows

### 6.1 Seat hold (the headline demo)

It is finals week and Main Stacks is full.
You will pay $5 for a seat, someone already in the library would happily hold one for $4, and neither of you knows the other exists.
An agent finds that person, takes the $1 spread, and everyone wins.

1. **Request.** A requester calls the voice line: "Save me a seat in Main Stacks in the next 10 minutes, I'll pay $5."
   The voice agent confirms the location, the 10-minute fill window, how long to hold the seat (default 30 minutes), and the cap.
2. **Fund and mint.** The cap moves to the vault and the task NFT is minted, as in every flow.
3. **Bids.** Errand agents price the job from the fill history of past `seat_hold` sub-tasks at that location (what reward got claimed, and how fast).
   The winner bids $5.00.
4. **Award.** The winner takes the task by accepting the NFT offer (pledge locked).
   The requester gets a 4-digit PIN by voice and on their task page.
5. **Recruit.** The agent posts a `seat_hold` sub-task: "$4 to save a seat in Main Stacks for the next 10 minutes."
   It funds the $4 from its own wallet, sets instant claim with a $0.50 pledge, and broadcasts it (see [6.4](#64-recruiting-humans)).
6. **Claim.** A student already in the library taps the link and claims.
   The claim is an atomic NFT accept, so only one person gets it.
7. **Seat saved.** The seat-holder posts the floor, a short description, and a photo of the seat.
   The requester's page updates live: "Seat saved: 3rd floor, window table, green backpack on the chair."
8. **Handoff and proof.** The requester walks up and says the PIN, and the seat-holder enters it.
9. **Settlement.** The seat-holder redeems $4.00 plus their pledge.
   The agent redeems $5.00 plus its pledge and nets $1.00.
10. **Failure and retry.**
    - Nobody claims within 5 minutes: the agent can repost at a higher reward (for example $4.50), trading margin for reliability. That decision shows up in its P&L.
    - Nobody claims within the fill window: the task fails, the requester is refunded, and the agent's pledge goes to the requester.
    - The seat-holder claims and then leaves (no PIN by the hold deadline, no seat photo): their pledge goes to the agent, and the agent's pledge goes to the requester.
    - The requester never shows up: if the seat-holder posted a seat photo inside the fill window, they are paid when the hold period ends. The requester asked for the seat, so the requester carries that risk.

```mermaid
flowchart TD
  R["Requester cap: $5.00"] -->|winning bid| A["Agent wins at $5.00"]
  A -->|sub-task, instant claim| H["Student in the library: $4.00"]
  A --> M["$1.00 agent margin"]
```

### 6.2 Food delivery

1. **Request.** A requester calls the ElevenLabs voice line: "I want a burrito delivered to Room 210, up to $15."
   The voice agent confirms the details and the cap aloud, then calls our `post_task` tool.
2. **Fund and mint.** The backend moves the cap in RLUSD from the requester's wallet to the vault and mints the task NFT.
   The task appears on the board.
3. **Price discovery.** House agents use Context.dev to find nearby restaurants and current menu prices, estimate food cost plus runner cost, and decide whether and how much to bid.
4. **Auction.** Bids stream onto the board for the auction window (20 seconds in the demo).
   The lowest price among bidders meeting the minimum pledge wins.
5. **Award.** The vault refunds the unused part of the cap to the requester.
   The winner accepts an NFT offer that costs exactly their pledge, which takes the task and locks the stake in a single atomic transaction.
6. **The agent places the order.** The winning agent phones the restaurant with an ElevenLabs outbound voice call and places a pickup order under the order number.
   The agent says it is an automated assistant ordering on a customer's behalf.
   The call transcript is attached to the task.
7. **The agent hires a runner.** The agent posts a sub-task: "Pick up order #4821 at Taqueria X, pay at the counter (about $9, reimbursed), deliver to Room 210. Fee: $4."
   It funds the sub-task from its own wallet.
8. **Runner claims.** A runner taps "Claim" on their phone.
   Claiming means accepting an open NFT offer priced at the runner's (small) pledge.
   The ledger guarantees exactly one runner can win it, even if two tap at the same moment.
9. **Pickup.** The runner pays at the counter and enters the receipt total, with a photo for audit.
   Reimbursement is capped at the food budget in the sub-task.
10. **Handoff and proof.** At award time, the requester was given a 4-digit PIN (spoken on the call and shown on their task page).
    The runner asks for it on delivery and enters it.
11. **Settlement.** A correct PIN completes the sub-task and the parent task.
    The runner redeems their NFT for reimbursement plus fee plus pledge.
    The agent redeems its NFT for the winning bid plus its pledge, which nets its margin.
12. **Failure.** If the deadline passes without a valid PIN, the vault burns the NFTs, refunds the requester, and pays slashed pledges to whoever was let down (the runner's pledge to the agent, the agent's pledge to the requester).

```mermaid
sequenceDiagram
  participant Req as Requester (phone)
  participant V as Voice agent (ElevenLabs)
  participant S as Agent Pledge server
  participant L as XRPL testnet
  participant Ag as Winning agent
  participant Rest as Restaurant
  participant Run as Human runner

  Req->>V: "Burrito to Room 210, up to $15"
  V->>S: post_task(food_delivery, cap=15)
  S->>L: Payment requester->vault 15 RLUSD
  S->>L: NFTokenMint (task NFT)
  S-->>Ag: task.posted (WebSocket)
  Ag->>S: bid(13.50, pledge=3)
  S->>L: Payment vault->requester 1.50 RLUSD (unused cap)
  S->>L: NFTokenCreateOffer sell, Amount=3 RLUSD, Destination=agent
  Ag->>L: NFTokenAcceptOffer (agent holds NFT, pledge locked)
  S-->>Req: PIN 4821
  Ag->>Rest: outbound call, pickup order
  Ag->>S: subtask.post(runner, 13.00)
  Run->>L: NFTokenAcceptOffer (claims sub-task, pays $1 pledge)
  Run->>Rest: pays ~$9 at counter
  Run->>Req: delivers burrito
  Req->>Run: "4821"
  Run->>S: proof.submit(pin=4821)
  S->>L: vault accepts runner's NFT sell offer (pays $14) then burns NFT
  S->>L: vault accepts agent's NFT sell offer (pays $16.50) then burns NFT
```

### 6.3 Bug fix

1. **Request.** "My site's build is broken. Repo is github.com/me/site, run `npm run build`. Up to $20."
   The voice agent or web form collects the repo URL, the command, and the cap.
2. **Reproduce.** The verifier clones the repo at the current commit and runs the command in a sandbox.
   It must fail.
   If it passes, the task is rejected before any money moves, because there is nothing to fix.
3. **Auction and award.** Same as delivery.
   Bug-fix agents (for example the Claude-powered house agent) estimate difficulty from the repo and error output before bidding.
4. **Fix.** The winning agent works on its own machine and submits a patch (a unified diff) against the pinned commit.
5. **Verify.** The verifier applies the patch to a clean checkout and reruns the command.
   - The command must exit 0.
   - The patch must not modify, delete, or skip files that are part of the check (for example test files or the build script), which blocks the "delete the test" cheat.
   - The patch must apply cleanly and stay under a size limit.
6. **Settlement.** On a pass, the agent redeems its NFT.
   The requester gets the patch, and optionally a pull request opened on their repo.
7. **Failure.** If no passing patch arrives before the deadline, the pledge goes to the requester.

### 6.4 Recruiting humans

When an agent needs a human, it writes a short post and broadcasts its sub-task where nearby people will see it.
Every broadcast carries a claim link (and a QR code) to the sub-task's page on the runner app.

| Channel | How | Hackathon status |
|---|---|---|
| Agent Pledge runner app | Push to runners who opted in and whose shared location is inside the task's geofence (for example the library) | P0 |
| Campus Discord or GroupMe | Bot or webhook posts to a channel the community opted into | P1 |
| SMS | Text to opted-in runners near the task | P1 |
| Yik Yak and other social apps | Yik Yak has no public posting API, and posting from a bot would break its terms. The agent drafts the post and claim link; a human posts it with one tap (copy and open the app). | P1, human-in-the-loop |

The agent writes the post itself and picks channels by location and urgency.
For a 10-minute window it goes wide right away; for a 2-hour window it starts with the runner app only.

### 6.5 Sub-tasks all the way down

Any task holder can post sub-tasks, and sub-task holders can post their own, so chains can be agent to human, agent to agent, or longer.

- **Agent to human:** an errand agent hires a seat-holder or a runner (6.1, 6.2).
- **Agent to agent:** Premium wins a $20 bug fix, has no coding ability of its own, and subcontracts it to Patch for $15.
- **Agent to agent to human:** a general concierge agent wins a seat-hold request in a building it does not cover and subcontracts to a campus errand agent, which hires a student.

Rules that keep chains honest:

- A parent must fully fund each child from its own wallet when posting it. No funding, no sub-task.
- The total reward of a parent's children must be at most the parent's price, so nobody can promise money they will not receive. (Children's pledges come from the child's holder, not the parent.)
- Maximum depth is 3.
- A child that fails pays its pledge to the parent holder, who can repost it (with a new reward) until the parent's deadline.
- If the parent fails, its unclaimed children are cancelled and refunded to it.
- The money tree on the board draws the whole chain, with a ledger link on every edge.

## 7. Auction rules

- Every task has a `cap` (the max the requester will pay) and a `min_pledge` (default 20% of the cap, minimum $1).
- A bid is valid if `price <= cap`, `pledge >= min_pledge`, the bidder's wallet holds at least the pledge, and the bid is signed by the bidder's XRPL key.
- The auction runs for a fixed window (20 seconds in the demo, configurable).
- **The winner is the lowest price among valid bids.**
  Ties go to the larger pledge, then to the earlier bid.
- If the winner does not accept the NFT offer within 15 seconds, the offer is cancelled and the next-best bid wins.
- Sub-tasks can use either an auction or **instant claim** (first to accept the open NFT offer wins).
  Runner and seat-holder sub-tasks use instant claim.

Why pledges instead of plain lowest-bid: a pure lowest-price auction rewards lowballers who then fail.
A pledge makes a cheap bid a promise backed by money, and failure compensates the requester directly.

## 8. On-ledger design (XRPL + RLUSD)

### 8.1 Network and asset

- Network: XRPL Testnet (`wss://s.altnet.rippletest.net:51233`).
- Asset: RLUSD, testnet issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`, currency code `524C555344000000000000000000000000000000`.
- Every participant (requester, agent, runner, vault) has a trust line to RLUSD.

### 8.2 Why a vault account and not native escrow

XRPL's Token Escrow amendment (XLS-85) is enabled on testnet and mainnet, so `EscrowCreate` can lock trust-line tokens.
However, the issuer has to opt in with the `allowTrustLineLocking` flag, and as of 2026-10-11 the RLUSD issuer has it **off** on both testnet and mainnet (we checked `account_info` on both).
So RLUSD cannot be put in a native escrow today.

Our design:

- A single **vault** account holds task funds and pledges.
- Every state change is a ledger transaction carrying a memo with the task ID, so the full history can be audited on a block explorer.
- The two moves that matter most, claiming a task and getting paid, are **atomic NFT swaps** that the ledger enforces, not the server alone.
- Hardening (P2): the vault's master key is disabled and it signs through a `SignerList` (2-of-3: coordinator, verifier, arbiter).
- Migration path: if RLUSD enables `allowTrustLineLocking`, each task's funds move into a native conditional escrow, and the verifier releases it by revealing the fulfillment.

### 8.3 Task NFT lifecycle

Task NFTs are minted by the vault with flags `tfBurnable | tfTransferable`, `TransferFee = 0`, `NFTokenTaxon` = task type, and a `URI` pointing to the task's JSON metadata (including the parent NFT ID for sub-tasks).

| Step | Transaction(s) | Effect |
|---|---|---|
| Post | `Payment` requester -> vault (cap, RLUSD) | Funds the task |
| | `NFTokenMint` by vault | Creates the task NFT |
| Award (auction) | `Payment` vault -> requester (cap minus winning price) | Refunds the unused cap |
| | `NFTokenCreateOffer` (sell, `Amount` = pledge in RLUSD, `Destination` = winner) | Only the winner can take it |
| Claim | `NFTokenAcceptOffer` by winner | **Atomic:** the winner pays the pledge and receives the NFT in one transaction. Holding the NFT is the lock. |
| Claim (instant) | `NFTokenCreateOffer` (sell, `Amount` = pledge, no `Destination`) then `NFTokenAcceptOffer` by the first claimer | The ledger serializes transactions, so a second claimer's accept fails because the offer is already consumed. No double assignment. |
| Complete | Verifier marks the task proven (server state plus a memo transaction) | Unlocks redemption |
| Redeem | Holder `NFTokenCreateOffer` (sell, `Amount` = reward + pledge, `Destination` = vault), then vault `NFTokenAcceptOffer` | **Atomic delivery-versus-payment:** the NFT returns to the vault and the holder is paid in one transaction |
| | `NFTokenBurn` by vault | Retires the task |
| Fail | `NFTokenBurn` by vault (issuer can burn because of `tfBurnable`) | Revokes the claim |
| | `Payment` vault -> requester (refund + slashed pledge) | Makes the requester whole |

Because the task NFT is transferable, a holder could in principle sell a completed-but-unredeemed task to someone else (invoice factoring).
That is out of scope for the hackathon, but the design allows it.

### 8.4 Wallets for humans

For the hackathon, requesters and runners get custodial testnet wallets created by the platform and linked to their phone number or session.
Agents bring their own keys.
Stretch: Xaman wallet sign-in for humans.

### 8.5 Stretch: credentials

Use XRPL Credentials (XLS-70) so the platform issues a `verified_runner` credential to runners who completed onboarding.
Tasks can require it.
This adds a third XRPL primitive (payments, NFTs, credentials) to one coherent product.

## 9. Sponsor integrations

Every sponsor tool does a real job in the product.

| Sponsor | Job in Agent Pledge |
|---|---|
| **XRPL / RLUSD** | All money movement, task NFTs as claim locks and payout receipts, pledges, refunds, slashing, and the public P&L |
| **ElevenLabs** | (1) Inbound voice agent that takes requests and calls our `post_task` tool. (2) Outbound call from the winning agent to the restaurant to place a pickup order. (3) Speaking the delivery PIN to the requester. |
| **Context.dev** | Restaurant discovery and live menu prices near the delivery address, so agents price their bids from real data instead of guesses |
| **Claude (Agent SDK)** | The reasoning inside the house agents, and the bug-fix agent's coding work |

## 10. House agents

We run several agents with different economics so the auction is a real contest.
All of them use the same public agent protocol as third-party agents, with no privileged access.

| Agent | Task types | Strategy |
|---|---|---|
| **Thrifty** | Seat hold, delivery | Low margin (~5%), only bids when its cost estimate is confident, minimum pledge |
| **Hustler** | Seat hold, delivery | Bids close to estimated cost to win volume; posts sub-tasks at a low reward and raises it only if nobody claims |
| **Premium** | Seat hold, delivery, bug fix | Higher margin, larger pledge than required, posts generous sub-task rewards so they fill instantly. Has no coding ability, so it subcontracts bug fixes to Patch. |
| **Patch** | Bug fix | Claude-powered coder; estimates difficulty from the error log and repo size before bidding |

Each errand agent estimates:

- Delivery: `cost = food price (Context.dev) + runner fee (distance-based) + call cost`
- Seat hold: `cost = the reward that gets claimed within the fill window`, learned from the fill history of past `seat_hold` sub-tasks at that location (with a starting prior of 70% of the cap)

`bid = cost x (1 + margin)`, capped at the task cap, and placed only if `confidence >= risk threshold`.

### Public profit and loss

Every agent has a public page that shows:

- Revenue (redeemed rewards), costs (sub-task funding), and net margin.
- Pledges posted, returned, and slashed.
- Win rate and bid history.

All of it is computed from ledger transactions filtered by memo, so it cannot drift from what actually happened on-chain.

### Bring your own agent

The agent SDK lets anyone connect an agent from their own machine.
The pitch for attendees: if you have spare Claude usage, run a bug-fix agent locally and let it earn on the board.

## 11. Agent protocol

Agents connect over WebSocket to `/agents/ws`.
An agent's identity is its XRPL address, and every message it sends is signed with that address's key.

### Server to agent

| Message | Payload |
|---|---|
| `task.posted` | `id, type, details, cap, min_pledge, deadline, auction_ends_at, parent_id?, nft_id` |
| `bid.placed` | `task_id, bidder, price, pledge` (public, so agents can react) |
| `task.awarded` | `task_id, winner, price, offer_id` (the NFT offer to accept) |
| `subtask.claimed` | `task_id, parent_id, claimer` |
| `subtask.status` | `task_id, note, photo_url?` (for example "Seat saved: 3rd floor, window table") |
| `task.completed` | `task_id, redeem_amount` |
| `task.failed` | `task_id, reason` |

### Agent to server

| Message | Payload |
|---|---|
| `hello` | `address, name, capabilities, signature` |
| `bid` | `task_id, price, pledge, eta_minutes, signature` |
| `subtask.post` | `parent_id, type, details, reward, min_pledge, deadline, claim_mode, geofence?, broadcast: { channels, message }` |
| `subtask.repost` | `task_id, new_reward` (cancels the unclaimed offer and reposts at the new reward) |
| `proof.submit` | `task_id, proof` (PIN, or a patch for bug fixes) |
| `call.transcript` | `task_id, transcript` (optional attachment) |

## 12. System architecture

```mermaid
flowchart LR
  Phone["Requester phone"] --> EL["ElevenLabs voice agent"]
  EL -->|tool call| API["API server (Node / TypeScript)"]
  Web["Web app: board, money tree, P&L, runner page"] <-->|WebSocket| API
  Agents["House agents + third-party agents"] <-->|WebSocket, signed| API
  API --> DB[("Postgres")]
  API --> Ledger["Ledger service (xrpl.js)"]
  Ledger <--> XRPL["XRPL Testnet"]
  API --> Verifier["Verifier (Docker sandbox)"]
  Agents --> CTX["Context.dev"]
  Agents --> ELOut["ElevenLabs outbound calls"]
```

Suggested stack:

- **Monorepo** in TypeScript (pnpm workspaces).
- `apps/web`: Next.js. Live board, money tree visual, agent P&L pages, mobile runner page, requester task page with PIN.
- `apps/server`: Node with Fastify and `ws`. Task state machine, auction engine, ElevenLabs tool webhooks.
- `packages/ledger`: xrpl.js wrapper for every transaction in section 8.3, with memos and retry on `tec`/`tel` results.
- `packages/agent-sdk`: WebSocket client, message signing, helpers for accepting offers and redeeming NFTs.
- `agents/*`: the four house agents.
- `services/verifier`: clones the repo, runs the command in Docker with CPU, memory, and time limits and no network after dependency install, then applies the patch and reruns.
- Postgres for tasks, bids, and the ledger transaction index (SQLite is fine for local development).

### Task state machine

`posted -> auctioning -> awarded -> claimed -> in_progress -> proven -> redeemed`

Any non-terminal state can move to `failed` on deadline or verification failure.
`awarded -> auctioning` happens when a winner does not accept the offer in time.

## 13. Demo plan

The seat hold is the live centerpiece: it needs no restaurant, finishes in minutes, and every judge has wanted a seat during finals.
If we are not near Main Stacks, the judge asks for a seat somewhere in the venue instead ("save me a seat at the front table"), and the flow is identical.

### Live (in-person judging)

1. A judge calls the number: "Save me a seat at the front table in the next 3 minutes, I'll pay $5."
2. The task appears on the board, and bids from Thrifty, Hustler, and Premium arrive within seconds.
3. The winner takes it at $5.00. The money tree draws itself, and each edge links to its testnet transaction.
4. The agent writes its recruiting post ("$4 to save a seat at the front table, next 3 minutes") and broadcasts it. It pops up on phones in the room, including on a projected Discord channel.
5. Someone in the room (ideally another attendee, not a teammate) claims it, puts a bag on a chair, and posts the photo. The judge's task page updates live.
6. The judge walks over and says the PIN. Both NFTs redeem on screen: $4.00 to the seat-holder, $1.00 margin to the agent.
7. Switch to the bug fix: post a broken repo, watch Premium win it and subcontract to Patch, see the verifier go red, then green. This shows an agent-to-agent chain.
8. End on the P&L page: who earned what, and Hustler losing a pledge on an earlier task where it lowballed the reward and nobody claimed.

### Filmed for the video

- The real Main Stacks seat hold during a busy hour.
- The full food delivery run, including the agent's call to the restaurant.

### 2-minute video outline

- 0:00 to 0:15. The problem and the one-sentence pitch.
- 0:15 to 0:50. Main Stacks: the call, bids, the recruiting post, a student claims, PIN handoff, $4 and $1 land on-chain.
- 0:50 to 1:15. Food delivery: the agent calling the restaurant (real audio), runner pickup, PIN at the door.
- 1:15 to 1:40. Bug fix: Premium subcontracts to Patch, red to green, payout up the chain.
- 1:40 to 2:00. Money trees, P&L page, testnet explorer, and the claim that nothing is hard-coded.

## 14. Build plan and priorities

### P0: the demo does not work without these

- [ ] Ledger service: wallets, RLUSD trust lines, funding, payments with memos, mint, offers, accept, burn.
- [ ] Task state machine and auction engine with pledge rules.
- [ ] WebSocket agent protocol and SDK, including sub-task posting with the funding rules from 6.5.
- [ ] Live board web page with the money tree (renders chains of any depth up to 3).
- [ ] Mobile runner page: claim link, geofenced push, status and photo updates, PIN entry.
- [ ] Seat-hold task: Thrifty agent, recruiting post, instant-claim sub-task, PIN proof.
- [ ] Bug-fix task: verifier (reproduce failure, apply patch, rerun, cheat checks) and the Patch agent.
- [ ] Food delivery task: Context.dev pricing, runner sub-task with receipt reimbursement.
- [ ] ElevenLabs inbound voice agent calling `post_task`.

### P1: makes it win

- [ ] ElevenLabs outbound restaurant call from the winning agent.
- [ ] Hustler and Premium agents, so the auction is contested.
- [ ] Agent-to-agent subcontracting: Premium hands bug fixes to Patch.
- [ ] Repost at a higher reward when a sub-task goes unclaimed.
- [ ] Broadcast to a campus Discord channel and SMS, plus the one-tap "post to Yik Yak" draft.
- [ ] Seat-hold pricing learned from fill history.
- [ ] Public P&L pages from the ledger index.
- [ ] Failure path demo: a task that times out and pays the slashed pledge to the requester.
- [ ] Explorer links on every money-tree edge.
- [ ] Deployed live link.

### P2: if time allows

- [ ] Vault `SignerList` multisig with the master key disabled.
- [ ] XRPL Credentials for verified runners.
- [ ] Pull request auto-opened for successful bug fixes.
- [ ] Xaman sign-in for humans.
- [ ] Packaged "run your own agent" CLI for attendees.

## 15. Risks and open questions

| Risk | Mitigation |
|---|---|
| Getting testnet RLUSD into our wallets | Ask the Ripple team at their table first thing. Fallback: issue our own test stablecoin from a team account with `allowTrustLineLocking` on, which also lets us demo native Token Escrow. |
| Restaurant hangs up on an AI caller | Call during a quiet hour, pick a restaurant that takes phone orders, and have the agent disclose it is automated. Fallback: the runner orders at the counter, and the call is shown from a recorded run. |
| ElevenLabs telephony setup takes too long | Set up the phone number and outbound calling in the first hours. Fallback: browser-based voice widget for intake. |
| Verifier runs untrusted code | Docker with resource limits, no network after install, a fresh container per run, and an allowlist of public GitHub repos for the demo. |
| Testnet latency (~4 seconds per ledger close) | Submit independent transactions in parallel and show pending states in the UI. |
| Agents fail to bid when Context.dev data is missing | Agents decline to bid rather than guess, and the board shows "no valid bids" honestly. |

Open questions:

- Does the hackathon platform require the repo to be public at submission? (Yes, so this private repo must be flipped to public before submitting.)
- Is judging in person, and is there a restaurant within a 10-minute walk?
- Who on the team owns voice, ledger, agents, and web?

## 16. Tracks we are targeting

- **Best Use of Ripple (primary).** Payments, NFTs as concurrency locks and atomic payout receipts, pledges, refunds and slashing in RLUSD, all combined in one product. Credentials if time allows.
- **Best Use of ElevenLabs (bonus).** Inbound task intake, outbound restaurant ordering, and spoken PINs.
- **Best Use of Context.dev (bonus).** Live restaurant and menu data driving agent pricing.
- **Most Technically Impressive (general).** A real multi-party market with on-ledger settlement, verified completion, chains of agents subcontracting to agents and humans, and agents making economic decisions (pricing, reposting, choosing pledges).

## 17. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-11 | XRPL + RLUSD as the payment rail (not AUSD on Base) | Native NFTs give on-ledger claim locks and atomic payouts with no smart contracts to write. Targets the Ripple track. |
| 2026-10-11 | Only two task types: food delivery and bug fix | A general marketplace demos as an empty shell. Both types complete for real and have objective proof. |
| 2026-10-11 | Add `seat_hold` as a third type and make it the live demo | It reuses the in-person PIN proof, needs no restaurant, finishes in minutes, and shows the agent-hires-a-human spread ($5 in, $4 out, $1 margin) in its simplest form. |
| 2026-10-11 | Sub-tasks can chain up to depth 3, agent to agent or agent to human, and each child must be fully funded by its parent | Lets agents specialize and subcontract while guaranteeing every promised reward is backed by money. |
| 2026-10-11 | Yik Yak broadcasts are drafted by the agent and posted by a human | Yik Yak has no public posting API, and bot posting would break its terms. Channels with real APIs (our app, Discord, SMS) are automated. |
| 2026-10-11 | Pledged auctions: lowest price among bidders who post the required stake | Plain lowest-bid invites lowballing and failure. Pledges make the name literal and compensate requesters. |
| 2026-10-11 | Agent orders by phone, human runner pays at the counter and is reimbursed | Restaurants do not take stablecoins. This keeps the whole flow real. |
| 2026-10-11 | Vault custody instead of native escrow for RLUSD | The RLUSD issuer has `allowTrustLineLocking` off on testnet and mainnet, so native Token Escrow of RLUSD is not possible today. |
| 2026-10-11 | Proofs: spoken PIN for delivery, command rerun for bug fix | Objective, automatic, and hard to fake. |
