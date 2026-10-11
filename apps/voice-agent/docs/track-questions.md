# Questions for the sponsor tables

Issue 15: make sure that the crypto design qualifies for the tracks we enter (PRD section 13).
Ask these questions at the Ripple table and at the YZi Labs table on day one.
Write the name of the person who answered, because judges sometimes give different answers.

## Ripple table (Best Use of Ripple)

Ask about testnet RLUSD in the same visit, because it blocks the ledger work (issue 1).

1. Our design uses RLUSD payments into a vault account, NFTs as claim locks (a sell offer with a `Destination`, accepted with `NFTokenAcceptOffer`), NFT-for-RLUSD payout swaps, and memos with the task ID on every vault transaction.
   Does this count as "Best Use of Ripple"?
2. The RLUSD issuer has `allowTrustLineLocking` off on testnet and mainnet, so we cannot use native Token Escrow (XLS-85).
   Is a vault account with a public memo trail acceptable instead?
3. Can you turn on `allowTrustLineLocking` for testnet RLUSD, or do you know of a plan to do so?
4. Can you send testnet RLUSD to our wallets?
   Issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`, currency code `524C555344000000000000000000000000000000`.
   We need enough for the vault, the local agent, and the demo requester to run several full rehearsals.
5. If we cannot get testnet RLUSD, is a test token that our team issues acceptable for judging?
   With our own issuer we can also show native Token Escrow.
6. Do you judge a testnet demo the same as a mainnet demo?
7. Does the XRPL accept an open NFT sell offer with `Amount` 0 and no `Destination` (issue 2)?
   Are there other limits on NFT offers that we should know?
8. Is there a feature that you want to see, for example Credentials for verified helpers or a multi-signature vault?

## YZi Labs table

1. Your setup steps use BSC Testnet.
   Do you judge an XRPL project the same as a BSC project?
2. If not, what is the smallest BSC part that would make us eligible?
   For example, a contract that records each pledge.
3. Our local agent has its own wallet, locks a pledge before it works, and each payment is on the ledger.
   Does this match what you look for in agents that people can trust?
4. The requester gives the task by voice on a phone call.
   Does a voice-first agent count for your track?
5. What must the submission include, for example a contract address, a wallet address, a video, or a repository?

## Where to record the answers

Add one row for each answer to the decision log in the root README (section 14, "Decision log").
Use the same table format:

```markdown
| 2026-10-11 | Ripple confirmed that the vault and NFT design counts for Best Use of Ripple (asked: <name>, answered: <name>). | <what this changes, or "no change"> |
| 2026-10-11 | YZi Labs judges an XRPL project the same as a BSC project (asked: <name>, answered: <name>). | <what this changes, or "no change"> |
```

If an answer means that we must change the design, also open an issue, link it in the row, and tell the team.
Then close issue 15 with a link to the decision log.
