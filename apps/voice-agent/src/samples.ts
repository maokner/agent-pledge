/**
 * Tool payloads from the sample transcripts in transcripts/.
 * A test checks that each transcript shows exactly these payloads, and scripts/simulate.ts sends them.
 */
import type { CreateTaskInput } from "@agent-pledge/shared";

/** A fictional 555 number, as ElevenLabs would put in system__caller_id. */
export const SAMPLE_CALLER_PHONE = "+15105550123";

/** transcripts/01-normal-call.md */
export const SAMPLE_NORMAL_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "the front table",
  time_limit_minutes: 3,
  price_usd: 5,
  caller_phone: SAMPLE_CALLER_PHONE,
};

/** transcripts/02-no-price.md: the caller gives the price only after the agent asks. */
export const SAMPLE_NO_PRICE_CALL: CreateTaskInput = {
  description: "Save two seats",
  place: "Main Stacks, second floor, near the windows",
  time_limit_minutes: 15,
  price_usd: 8,
  caller_phone: "+15105550188",
};

/** transcripts/04-server-error.md: the same kind of task, while the server fails. */
export const SAMPLE_SERVER_ERROR_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "Moffitt Library, third floor",
  time_limit_minutes: 10,
  price_usd: 6,
  caller_phone: "+15105550147",
};
