import type { IssuedCurrencyAmount } from "xrpl";
import type { LedgerConfig } from "../config.js";

/**
 * A money value for an issued-currency (IOU) amount, such as RLUSD.
 * Pass a decimal string ("5", "4.50"), a bigint, or a safe integer number.
 * Floats are rejected on purpose: IOU values must never pass through binary floating point.
 */
export type DecimalInput = string | bigint | number;

/** XRPL issued-currency amounts keep at most 15 significant digits. */
export const MAX_IOU_SIGNIFICANT_DIGITS = 15;

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

interface Scaled {
  /** The value multiplied by 10^scale. */
  units: bigint;
  scale: number;
}

function toDecimalString(value: DecimalInput): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new RangeError(`Amount must not be negative: ${value}`);
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(
        `Amount ${value} is not a non-negative safe integer. Pass a decimal string such as "4.5" instead.`,
      );
    }
    return value.toString();
  }
  return value.trim();
}

function parse(value: DecimalInput): Scaled {
  const text = toDecimalString(value);
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new TypeError(
      `Amount "${text}" is not a non-negative decimal string (for example "5" or "4.50").`,
    );
  }
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

function render({ units, scale }: Scaled): string {
  const digits = units.toString().padStart(scale + 1, "0");
  if (scale === 0) return digits;
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function rescale(value: Scaled, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function significantDigits(normalized: string): number {
  return normalized.replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length;
}

/**
 * Normalizes a money value to the canonical decimal string used in XRPL IOU amounts.
 * Examples: "5.00" -> "5", "0.50" -> "0.5", 4n -> "4", 6 -> "6".
 * Throws on negative values, exponents, floats, and more than 15 significant digits.
 */
export function formatIouValue(value: DecimalInput): string {
  const normalized = render(parse(value));
  if (significantDigits(normalized) > MAX_IOU_SIGNIFICANT_DIGITS) {
    throw new RangeError(
      `Amount ${normalized} has more than ${MAX_IOU_SIGNIFICANT_DIGITS} significant digits.`,
    );
  }
  return normalized;
}

/** Adds money values exactly, for example the refund "price + pledge". */
export function addIouValues(...values: DecimalInput[]): string {
  const parsed = values.map(parse);
  const scale = Math.max(0, ...parsed.map((p) => p.scale));
  const units = parsed.reduce((sum, p) => sum + rescale(p, scale), 0n);
  return formatIouValue(render({ units, scale }));
}

/** Compares two money values exactly. Returns -1, 0, or 1. */
export function compareIouValues(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const ua = rescale(pa, scale);
  const ub = rescale(pb, scale);
  return ua === ub ? 0 : ua < ub ? -1 : 1;
}

export function isZeroIouValue(value: DecimalInput): boolean {
  return parse(value).units === 0n;
}

/** Builds the configured token amount (RLUSD or the fixture token). The value must be positive. */
export function tokenAmount(config: LedgerConfig, value: DecimalInput): IssuedCurrencyAmount {
  const normalized = formatIouValue(value);
  if (isZeroIouValue(normalized)) throw new RangeError("Token amount must be greater than zero.");
  return {
    currency: config.XRPL_TOKEN_CURRENCY,
    issuer: config.XRPL_TOKEN_ISSUER,
    value: normalized,
  };
}
