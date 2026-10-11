# Voice agent test plan

This plan proves requirements R1 and R9 from the PRD (section 3) and covers every test in issue 14.
Part 1 runs without credentials.
Part 2 needs an ElevenLabs API key and a phone number.

## Part 1: automated checks (no credentials)

Run these from `apps/voice-agent`:

- [ ] `pnpm test` passes.
      It checks the payloads, the prompt rules, the transcripts, and the mock server.
- [ ] `pnpm simulate` passes.
      It starts a mock server and sends the sample tool payloads.
- [ ] `pnpm provision --dry-run` prints five requests: a secret, two tools, the agent, and (with `ELEVENLABS_PHONE_NUMBER_ID`) the phone number.
- [ ] When the real server is deployed: `VOICE_TOOL_SECRET=... pnpm simulate --url https://<server>` passes.
      This checks that the server matches the contract.
      It creates two real tasks, so run it before a rehearsal and not during one.

## Part 2: live calls

### Setup with the mock server

Use this setup before the real server exists.

1. Start the mock server: `pnpm mock-server`.
2. Open a public https tunnel to it, for example `cloudflared tunnel --url http://localhost:8787` or `ngrok http 8787`.
3. Put the tunnel URL in `.env` as `PUBLIC_BASE_URL`.
4. Run `pnpm provision`.
   On the first run, copy the printed `ELEVENLABS_AGENT_ID` into `.env`.
5. A quick tunnel gets a new URL each time it starts.
   When the URL changes, update `PUBLIC_BASE_URL` and run `pnpm provision` again.

The mock server prints every request and response.
Use `GET /mock/tasks` (with the `x-voice-secret` header) to see the stored tasks and their PINs.

### Setup with the real server

1. Set `PUBLIC_BASE_URL` to the deployed server and `VOICE_TOOL_SECRET` to the server's secret.
2. Run `pnpm provision`.
3. Open the board next to the phone.

### Tests

Make each call from a real phone to the agent's number, on speaker.
For each test, write the result in the table at the end.

- [ ] **T1. Normal call (R1).**
      Say: "Save me a seat at the front table in the next 3 minutes. I will pay 5 dollars."
      Pass if the agent repeats the four values, waits for your "yes", calls create_task, says the PIN two times digit by digit, and says the board address.
      Compare the call with `transcripts/01-normal-call.md`.
- [ ] **T2. The PIN matches (R1).**
      Write down the PIN that you hear in T1.
      Pass if it is the PIN stored for the task (`GET /mock/tasks` or the server database).
- [ ] **T3. The caller ID is used.**
      Pass if `caller_phone` in the create_task request is the number of the phone that called, and the agent never asked for it.
- [ ] **T4. Two different calls (R9).**
      Make a second call with a different task, place, time limit, and price, for example "Hold two seats in Main Stacks, second floor, within 15 minutes, for 8 dollars."
      Pass if both tasks have exactly the values from their calls, in the mock log or on the board.
- [ ] **T5. No price.**
      Ask for a seat but do not say a price.
      When the agent asks, say "What do people usually pay?"
      Pass if the agent asks for a price, does not suggest one, and creates the task only after you say a price.
      Compare with `transcripts/02-no-price.md`.
- [ ] **T6. Not a seat hold.**
      Ask for a food delivery.
      Pass if the agent says exactly "Right now I can only save seats." and the mock log shows no create_task request.
      Compare with `transcripts/03-not-a-seat.md`.
- [ ] **T7. Server down.**
      Stop the mock server, or start it with `pnpm mock-server --fail create_task`.
      Make a normal call.
      Pass if the agent apologizes, offers to try again, tries at most one more time, and never says a PIN.
      Compare with `transcripts/04-server-error.md`.
- [ ] **T8. Noisy room.**
      Call on speaker in a loud room, or play crowd noise near the phone.
      Pass if the agent gets all four values correctly, and the noise does not cut off the PIN.
- [ ] **T9. Task status.**
      The agent can only check a task from the same call, so keep the call open for this test.
      Make a normal call and stay on the line after the PIN.
      From a laptop, set the task to claimed: `curl -X POST <base>/mock/tasks/<task_id> -H "x-voice-secret: <secret>" -d '{"status":"claimed","helper_note":"Front table, left side"}'`.
      Then ask the agent: "Has anyone taken it yet?"
      Pass if the agent says that a helper has taken it and reads the helper note.

### Record the results

Post the results as a comment on issue 14, in this form:

```markdown
| Test               | Result | Notes                                   |
| ------------------ | ------ | --------------------------------------- |
| T1 Normal call     | pass   | <PIN heard>, board address said clearly |
| T2 PIN matches     | pass   |                                         |
| T3 Caller ID       | pass   | <caller_phone in the request>           |
| T4 Two calls (R9)  | pass   |                                         |
| T5 No price        | pass   |                                         |
| T6 Not a seat hold | pass   |                                         |
| T7 Server down     | pass   |                                         |
| T8 Noisy room      | pass   |                                         |
| T9 Task status     | pass   |                                         |
```

If a live call does not match its sample transcript, change the prompt or the transcript so that they match, and run `pnpm test` again.
