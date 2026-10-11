// Owner: bundle D (#23, #24). Helper payout (redeem offer + vault accept + burn), task.redeemable to the agent,
// agent payout after POST /agent/tasks/:id/redeem (bundle B calls into this), and the failure flow (failTask).
// Idempotency: claim the *_started_at marker with a conditional UPDATE ... WHERE x IS NULL before ledger calls.
export {};
