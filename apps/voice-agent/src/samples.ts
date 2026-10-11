/**
 * Tool payloads from the sample transcripts in transcripts/.
 * A test checks that each transcript shows exactly these payloads, and scripts/simulate.ts sends them.
 */
import type { CreateTaskInput } from "@agent-pledge/shared";

/** A fictional 555 number, as ElevenLabs would put in system__caller_id. */
export const SAMPLE_CALLER_PHONE = "+15105550123";

/** Fictional conversation ids, as ElevenLabs would put in system__conversation_id. One per sample call. */
export const SAMPLE_CALL_IDS = {
  normal: "conv_sample_01",
  noPrice: "conv_sample_02",
  serverError: "conv_sample_04",
  rightNow: "conv_sample_05",
  seatAndCoffee: "conv_sample_06",
} as const;

/** transcripts/01-normal-call.md */
export const SAMPLE_NORMAL_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "the front table",
  time_limit_minutes: 3,
  price_usd: 5,
  caller_phone: SAMPLE_CALLER_PHONE,
  call_id: SAMPLE_CALL_IDS.normal,
};

/** transcripts/02-no-price.md: the caller gives the price only after the agent asks. */
export const SAMPLE_NO_PRICE_CALL: CreateTaskInput = {
  description: "Save two seats",
  place: "Main Stacks, second floor, near the windows",
  time_limit_minutes: 15,
  price_usd: 8,
  caller_phone: "+15105550188",
  call_id: SAMPLE_CALL_IDS.noPrice,
};

/** transcripts/04-server-error.md: the same kind of task, while the server fails. The retry sends the same call_id. */
export const SAMPLE_SERVER_ERROR_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "Moffitt Library, third floor",
  time_limit_minutes: 10,
  price_usd: 6,
  caller_phone: "+15105550147",
  call_id: SAMPLE_CALL_IDS.serverError,
};

/** transcripts/05-right-now.md: "right now" becomes 2 minutes, because the time limit must be a whole number of at least 1. */
export const SAMPLE_RIGHT_NOW_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "the front table",
  time_limit_minutes: 2,
  price_usd: 4,
  caller_phone: "+15105550171",
  call_id: SAMPLE_CALL_IDS.rightNow,
};

/** transcripts/06-seat-and-coffee.md: the caller also asks for a coffee, which stays out of the task. */
export const SAMPLE_SEAT_AND_COFFEE_CALL: CreateTaskInput = {
  description: "Save one seat",
  place: "the Free Speech Movement Cafe",
  time_limit_minutes: 10,
  price_usd: 6,
  caller_phone: "+15105550163",
  call_id: SAMPLE_CALL_IDS.seatAndCoffee,
};
