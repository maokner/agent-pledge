# Transcript 05: right now

The caller asks for a seat "right now".
The time limit must be a whole number of at least 1 minute, so the agent makes it 2 minutes and tells the caller before the summary.
Without this rule, the agent would send 0 minutes and the server would reject the task.

**Agent:** Hi, this is Agent Pledge, and I can save you a seat.
What do you need?

**Caller:** I need a seat at the front table right now.
I will pay 4 dollars.

**Agent:** I will make that 2 minutes.
Is that OK?

**Caller:** Sure.

**Agent:** To confirm: save one seat, at the front table, within 2 minutes, for up to 4 dollars.
Is that right?

**Caller:** Yes.

**Agent:** One moment.

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
Again: 3, 9, 6, 5.
Give this PIN to the helper when you meet them.
You can watch your task at agent dash pledge dot fly dot dev slash board.
Do you need anything else?

**Caller:** No, thanks.

**Agent:** Thanks, goodbye.

**Tool call:** `end_call`

```json
{}
```
