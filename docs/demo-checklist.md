# Demo-day checklist (issue #30)

Requirements R1 to R9 from PRD section 3, each with its test. Copy this file (or this issue comment) for each rehearsal and tick it during the run.
Procedure: [`docs/runbook.md`](runbook.md). Done when two back-to-back rehearsals pass with every box ticked and nobody touching the laptop.

Rehearsal: ______  Date/time: ______  Ledger mode: xrpl / fake  Operator: ______

## Pre-flight

- [ ] `pnpm demo:reset` ran with no `WARNINGS`, and the server was restarted
- [ ] `curl $API/health` returns 200 with the expected `ledger_mode`
- [ ] Board loads on a phone over cellular data and shows 0 tasks
- [ ] Local agent connected (its console, and `/ws/agent` in the Render log)
- [ ] Yik Yak open and logged in on the demo laptop; last post more than 10 minutes ago
- [ ] Phone number answers (hang up before "yes")
- [ ] Helper phone: cellular data, private tab, never used Agent Pledge
- [ ] Board and the laptop browser on the projector

## R1 to R9 (run 1 = success, run 2 = failure)

- [ ] **R1 Voice agent.** Test: call the number, make a task, hear the PIN.
  - [ ] Run 1: the agent repeats task, place, time limit, and price; we say yes; it says the PIN twice
  - [ ] Run 2: same, with different values
- [ ] **R2 Local agent.** Test: make a call with no person at the laptop; the sub-task appears on the board.
  - [ ] Run 1: task claimed and sub-task created with nobody touching the laptop
  - [ ] Run 2: same
- [ ] **R3 Board online.** Test: open the board on a phone, make a task, see it appear.
  - [ ] The task card appears in under 2 seconds on the projector and on a phone over cellular
  - [ ] Every later change (claim, sub-task, photo, PIN, payout, failure) shows in under 2 seconds
- [ ] **R4 Money escrow.** Test: one success and one failure; check every payment on the XRPL testnet explorer.
  - [ ] Run 1: task funding into the vault before any work; helper payout and agent payout only after the correct PIN
  - [ ] Run 2: refund to the requester (price + pledge) and to the agent (sub-task money)
  - [ ] Every explorer link opens and shows a validated transaction
- [ ] **R5 NFT escrow.** Test: tap "claim" on two phones at the same time; only one claim succeeds.
  - [ ] One phone gets the sub-task; the other sees "Already claimed"
  - [ ] Task and sub-task NFTs exist (explorer), and each payout swaps the NFT back in one transaction
- [ ] **R6 Yik Yak post.** Test: make a task; see the post on Yik Yak on a phone; see the screenshot on the board.
  - [ ] The post appears in the Yik Yak app on a phone, with the claim link
  - [ ] The screenshot appears on the board
- [ ] **R7 Claim page.** Test: do the full claim on a phone that has never used Agent Pledge.
  - [ ] Opened from the Yik Yak link; claim, photo, note, and PIN all work; no crypto wallet needed
- [ ] **R8 PIN proof.** Test: enter a wrong PIN (no payment), then the correct PIN (payment).
  - [ ] Wrong PIN: "2 attempts left" and no payout transaction
  - [ ] Correct PIN: "Paid $X.XX" with an explorer link
  - [ ] (Once, outside the timed runs) three wrong PINs lock the sub-task
- [ ] **R9 Nothing hard-coded.** Test: make two calls with different tasks and prices; both work.
  - [ ] Run 1 and run 2 used different task text, place, price, and time limit, and the board, the post, and the payouts match each call

## Fallbacks tested this rehearsal

- [ ] Web form on the board creates a task when the call fails
- [ ] `POST /admin/tasks/:id/fail` (from the operator laptop) runs the failure flow
- [ ] Backup recording of a Yik Yak post is on the presenting laptop
- [ ] Plan agreed for slow XRPL testnet (narrate "pending", longer time limit) and for testnet down (`LEDGER_MODE=fake`)

## Timings

| Step | Run 1 | Run 2 |
|---|---|---|
| Call start to task on board | | |
| Task on board to sub-task created | | |
| Sub-task to Yik Yak post on a phone | | |
| Claim to "claimed" on board | | |
| Correct PIN to helper paid | | |
| Helper paid to task done / deadline to refunds | | |
