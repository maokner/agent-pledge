# Sample transcripts

These transcripts show how the voice agent must behave.
They are the reference for the live test calls in TESTING.md.
The board URL `https://agent-pledge.fly.dev/board` is an example; the real URL comes from the server.

| File | Scenario |
|---|---|
| 01-normal-call.md | The caller gives all four values at once. |
| 02-no-price.md | The caller does not give a price, and asks about the task status. |
| 03-not-a-seat.md | The caller asks for food delivery. |
| 04-server-error.md | The server fails two times. |
| 05-right-now.md | The caller says "right now", so the agent makes the time limit 2 minutes. |

Format rules, which `test/transcripts.test.ts` checks:

- A turn starts with `**Agent:**` or `**Caller:**`.
  A turn can continue on the next lines, with one sentence on each line.
- A tool call is a `**Tool call:**` line with the tool name, then a JSON block with the arguments.
- A tool result is a `**Tool result:**` line with the HTTP status, then a JSON block with the body.
- The create_task arguments must equal the samples in `src/samples.ts`, which `pnpm simulate` sends to the server.
