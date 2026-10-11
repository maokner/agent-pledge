# Transcript 05: right now

The caller asks for a seat "right now".
The time limit must be a whole number of at least 1 minute, so the agent makes it 2 minutes and tells the caller before the summary.
Without this rule, the agent would send 0 minutes and the server would reject the task.

**Agent:** Hey, what's up?
I'm your Pledge, I can do anything you want, so what do you need?

**Caller:** I need a seat at the front table right now.
I will pay 4 dollars.

**Agent:** I will make that 2 minutes.
Is that OK?

**Caller:** Sure.

**Agent:** Sure thing, gotcha covered.

**Tool call:** `create_task`

```json
{
  "description": "Save one seat",
  "place": "the front table",
  "time_limit_minutes": 2,
  "price_usd": 4,
  "caller_phone": "+15105550171",
  "call_id": "conv_sample_05"
}
```

**Tool result:** HTTP 200

```json
{
  "task_id": "task_5b1e8f2c7a90",
  "pin": "3965",
  "board_url": "https://agent-pledge.fly.dev/board"
}
```

**Agent:** Your PIN is 3, 9, 6, 5.
Later!

**Tool call:** `end_call`

```json
{}
```
