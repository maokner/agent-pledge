# Sample transcripts

These transcripts show how the voice agent must behave.
They are the reference for the live test calls in TESTING.md.
The board URL `https://agent-pledge.fly.dev/board` is an example; the real URL comes from the server.

| File | Scenario |
|---|---|
| 01-normal-call.md | The caller gives all four values at once. |
| 02-no-price.md | The caller does not give a price, and asks about the task status. |
| 03-not-a-seat.md | The caller asks for food delivery, then for a spot in a line. |
| 04-server-error.md | The server fails two times. |
| 05-right-now.md | The caller says "right now", so the agent makes the time limit 2 minutes. |
| 06-seat-and-coffee.md | The caller asks for a seat and a coffee, and the agent saves only the seat. |

Format rules, which `test/transcripts.test.ts` checks:

- A turn starts with `**Agent:**` or `**Caller:**`.
  A turn can continue on the next lines, with one sentence on each line.
- A tool call is a `**Tool call:**` line with the tool name, then a JSON block with the arguments.
- A tool result is a `**Tool result:**` line with the HTTP status, then a JSON block with the body.
- The create_task arguments must equal the samples in `src/samples.ts`, which `pnpm simulate` sends to the server.

Behavior rules, which the same test checks:

- Every agent turn has one or two sentences and at most 20 words.
  The summary ("To confirm: ...") and the PIN turn are checked against their exact form instead.
- The PIN turn is the agent turn right after a successful create_task.
  It has the PIN two times, the helper sentence, the board address as the prompt says it, and "Do you need anything else?".
- Right before each create_task call there are exactly three events: the summary of the exact values in the call, a caller yes, and "One moment.".
  A retry replaces the summary with the retry offer, and it must repeat the values of a call that failed with an error other than `invalid_input`.
- The description in create_task is only the seat hold, for example "Save one seat".
