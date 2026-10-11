# Transcript 04: server error

The server fails.
The agent apologizes, offers to try again, and never says a PIN.
Rehearse it with `pnpm mock-server --fail create_task`, or with the server stopped.

**Agent:** Hi, this is Agent Pledge.
I can save you a seat.
What do you need?

**Caller:** Hold a seat for me on the third floor of Moffitt.
10 minutes, 6 dollars.

**Agent:** To confirm: save one seat, at Moffitt Library, third floor, within 10 minutes, for up to 6 dollars.
Is that right?

**Caller:** Yes.

**Agent:** One moment.

**Tool call:** `create_task`

```json
{
  "description": "Save one seat",
  "place": "Moffitt Library, third floor",
  "time_limit_minutes": 10,
  "price_usd": 6,
  "caller_phone": "+15105550147"
}
```

**Tool result:** HTTP 503

```json
{
  "error": "unavailable",
  "message": "The mock server is set to fail create_task."
}
```

**Agent:** Sorry, something went wrong on our side.
Do you want me to try again?

**Caller:** Yes, please.

**Agent:** One moment.

**Tool call:** `create_task`

```json
{
  "description": "Save one seat",
  "place": "Moffitt Library, third floor",
  "time_limit_minutes": 10,
  "price_usd": 6,
  "caller_phone": "+15105550147"
}
```

**Tool result:** HTTP 503

```json
{
  "error": "unavailable",
  "message": "The mock server is set to fail create_task."
}
```

**Agent:** Sorry, it is still not working.
Please call back in a few minutes.

**Tool call:** `end_call`

```json
{}
```
