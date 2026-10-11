/**
 * Checks the backup form's input (#38). The same function runs in the
 * browser (to show errors next to each field) and in the route handler
 * (which never trusts the browser). The server's create_task validates too.
 */
import type { CreateTaskRequest } from "@agent-pledge/shared";

export type BackupTaskField = "description" | "place" | "time_limit_minutes" | "price_usd" | "caller_phone";

/** A create_task request without the phone, which the route handler fills in if missing. */
export interface BackupTaskInput extends Omit<CreateTaskRequest, "caller_phone"> {
  caller_phone: string | null;
}

export type BackupTaskValidation =
  | { ok: true; value: BackupTaskInput }
  | { ok: false; errors: Partial<Record<BackupTaskField, string>> };

export const TIME_LIMIT_RANGE = { min: 1, max: 240 } as const;
export const PRICE_RANGE = { min: 0.01, max: 100 } as const;
const E164 = /^\+[1-9]\d{6,14}$/;

/** Accepts form strings or JSON numbers. */
export function validateBackupTask(input: unknown): BackupTaskValidation {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: Partial<Record<BackupTaskField, string>> = {};

  const description = text(raw.description);
  if (description.length < 3 || description.length > 200) errors.description = "Say what to do, in 3 to 200 characters.";

  const place = text(raw.place);
  if (place.length < 2 || place.length > 200) errors.place = "Say where, in 2 to 200 characters.";

  const minutes = number(raw.time_limit_minutes);
  if (!Number.isInteger(minutes) || minutes < TIME_LIMIT_RANGE.min || minutes > TIME_LIMIT_RANGE.max) {
    errors.time_limit_minutes = `Whole minutes, ${TIME_LIMIT_RANGE.min} to ${TIME_LIMIT_RANGE.max}.`;
  }

  const price = number(raw.price_usd);
  const wholeCents = Math.abs(price * 100 - Math.round(price * 100)) < 1e-6;
  if (!(price >= PRICE_RANGE.min && price <= PRICE_RANGE.max) || !wholeCents) {
    errors.price_usd = `A dollar amount from $${PRICE_RANGE.min} to $${PRICE_RANGE.max}, in cents at most.`;
  }

  const phone = text(raw.caller_phone);
  if (phone && !E164.test(phone)) errors.caller_phone = "Leave empty, or use the +15105550123 form.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { description, place, time_limit_minutes: minutes, price_usd: price, caller_phone: phone || null },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}
