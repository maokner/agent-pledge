# Demo evidence

One folder per demo task, written by `pnpm demo:evidence` and committed so the proof outlives the tunnel and the local database.
Each folder has a `README.md` with the four demo steps, every transaction with its signer and signature, the life of each NFT, the final balances, the raw ledger records in `evidence.json`, the helper's photo, the Yik Yak image, and board and claim page screenshots.

| Folder | Task | Result |
|---|---|---|
| [task_ibubjgka23gcd8ad](task_ibubjgka23gcd8ad/README.md) | "Reserve a seat for me" at Main Stacks, $5, 2026-10-11 | Done. 15 validated transactions, helper paid $4 after the PIN, agent paid $6 ($5 + $1 pledge back), both NFTs burned. |
| [task_tocrvmv90cv1ojpy](task_tocrvmv90cv1ojpy/README.md) | "Deliver me a peach-flavored Ghost energy drink", $7, 2026-10-12 | Done through the deployed claim page. The proof photo paid the helper $5.50 nine seconds after upload; its sha256 is in the payout memos; agent paid $8; both NFTs burned. Screenshots in [live-site-claim](live-site-claim/). |

## Regenerate

With the demo stack running (`pnpm demo:local`):

```sh
pnpm demo:evidence --api http://localhost:3002                # the newest task on the board
pnpm demo:evidence --api http://localhost:3002 --task task_x  # one task
```

The script reads the task from the public board API and then reads every transaction again from the XRPL, so the report needs no seed and nothing in it comes from the database alone.
The output goes to `docs/evidence/<task id>/` relative to where you run the command.
