import { z } from "zod";

/**
 * Money in the API is a decimal string with exactly 2 decimals, for example "5.00".
 * The database stores integer cents. Use toCents / fromCents to convert.
 */
export const MONEY_REGEX = /^\d{1,7}\.\d{2}$/;

export const Money = z.string().regex(MONEY_REGEX, 'money must look like "5.00"');
export type Money = z.infer<typeof Money>;

/** Accepts 5, 5.5, "5", "5.5", "$5.00" and returns "5.00". Throws on anything else. */
export function normalizeMoney(input: number | string): Money {
  return fromCents(toCents(input));
}

/** "5.00" -> 500. Also accepts numbers (5 -> 500) and strings with fewer decimals ("5.5" -> 550). */
export function toCents(input: number | string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`invalid money amount: ${input}`);
    return Math.round(input * 100);
  }
  const s = input.trim().replace(/^\$/, "");
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) throw new Error(`invalid money amount: ${input}`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + frac;
}

/** 500 -> "5.00". */
export function fromCents(cents: number): Money {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`invalid cents: ${cents}`);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

/**
 * Base-demo sub-task price: 80% of the task price, rounded down to the nearest 50 cents.
 * subtaskPriceCents(500) === 400.
 */
export function subtaskPriceCents(taskPriceCents: number): number {
  return Math.floor((taskPriceCents * 0.8) / 50) * 50;
}
