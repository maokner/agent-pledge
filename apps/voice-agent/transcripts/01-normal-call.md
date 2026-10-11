# Transcript 01: normal call

The caller gives the task, the place, the time limit, and the price in one sentence.
This is steps 1 to 6 of the base demo in the PRD (section 2.1).

**Agent:** Hey, what's up?
I'm your Pledge, I can do anything you want, so what do you need?

**Caller:** Save me a seat at the front table in the next 3 minutes.
I will pay 5 dollars.

**Agent:** Sure thing, gotcha covered.

**Tool call:** `create_task`

```json
{
  "description": "Save one seat",
  "place": "the front table",
  "time_limit_minutes": 3,
  "price_usd": 5,
  "caller_phone": "+15105550123",
  "call_id": "conv_sample_01"
}
```

**Tool result:** HTTP 200

```json
{
  "task_id": "task_7c2a9d4e1b3f",
  "pin": "4821",
  "board_url": "https://agent-pledge.fly.dev/board"
}
```

**Agent:** Your PIN is 4, 8, 2, 1.
Later!

**Tool call:** `end_call`

```json
{}
```
