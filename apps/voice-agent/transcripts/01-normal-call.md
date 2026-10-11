# Transcript 01: normal call

The caller gives the task, the place, the time limit, and the price in one sentence.
This is steps 1 to 6 of the base demo in the PRD (section 2.1).

**Agent:** Hi, this is Agent Pledge.
I can save you a seat.
What do you need?

**Caller:** Save me a seat at the front table in the next 3 minutes.
I will pay 5 dollars.

**Agent:** To confirm: save one seat, at the front table, within 3 minutes, for up to 5 dollars.
Is that right?

**Caller:** Yes.

**Agent:** One moment.

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
Again: 4, 8, 2, 1.
Give this PIN to the helper when you meet them.
You can watch your task at agent dash pledge dot fly dot dev slash board.
Do you need anything else?

**Caller:** No, that's it.

**Agent:** Thanks, goodbye.

**Tool call:** `end_call`

```json
{}
```
