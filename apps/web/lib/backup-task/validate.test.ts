import { describe, expect, it } from "vitest";
import { validateBackupTask } from "./validate";

const good = {
  description: "  Save me a seat at the front table ",
  place: "Main Stacks, front table",
  time_limit_minutes: "3",
  price_usd: "5",
  caller_phone: "",
};

describe("validateBackupTask", () => {
  it("accepts the PRD's example as typed into the form, trimmed and with numbers parsed", () => {
    expect(validateBackupTask(good)).toEqual({
      ok: true,
      value: {
        description: "Save me a seat at the front table",
        place: "Main Stacks, front table",
        time_limit_minutes: 3,
        price_usd: 5,
        caller_phone: null,
      },
    });
  });

  it("accepts numbers from a JSON body and a phone number in E.164 form", () => {
    const result = validateBackupTask({
      ...good,
      time_limit_minutes: 10,
      price_usd: 4.5,
      caller_phone: "+15105550123",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { time_limit_minutes: 10, price_usd: 4.5, caller_phone: "+15105550123" },
    });
  });

  it("names every field that is wrong", () => {
    const result = validateBackupTask({
      description: " ",
      place: "",
      time_limit_minutes: "2.5",
      price_usd: "0",
      caller_phone: "510-555",
    });

    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual(
      ["caller_phone", "description", "place", "price_usd", "time_limit_minutes"].sort(),
    );
  });

  it("keeps time limits and prices in a range that makes sense for a seat hold", () => {
    const errors = (input: object) => {
      const result = validateBackupTask({ ...good, ...input });
      return result.ok ? {} : result.errors;
    };

    expect(errors({ time_limit_minutes: "0" })).toHaveProperty("time_limit_minutes");
    expect(errors({ time_limit_minutes: "241" })).toHaveProperty("time_limit_minutes");
    expect(errors({ time_limit_minutes: "240" })).toEqual({});
    expect(errors({ price_usd: "100.01" })).toHaveProperty("price_usd");
    expect(errors({ price_usd: "1.005" })).toHaveProperty("price_usd");
    expect(errors({ price_usd: "abc" })).toHaveProperty("price_usd");
    expect(errors({ price_usd: "0.50" })).toEqual({});
    expect(errors({ price_usd: "0.29" })).toEqual({});
    expect(errors({ price_usd: "19.99" })).toEqual({});
  });

  it("rejects a body that is not an object", () => {
    expect(validateBackupTask(null).ok).toBe(false);
    expect(validateBackupTask("hi").ok).toBe(false);
  });
});
