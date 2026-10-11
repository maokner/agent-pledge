import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a background image next to a background color", () => {
    expect(cn("bg-human-inverted", "bg-human-dots")).toBe("bg-human-inverted bg-human-dots");
    expect(cn("bg-human-muted", "bg-human-gradient-button")).toBe("bg-human-muted bg-human-gradient-button");
  });

  it("still lets a later color win over an earlier one", () => {
    expect(cn("bg-human-card", "bg-human-muted")).toBe("bg-human-muted");
  });

  it("treats font-mono as a family, not a weight", () => {
    expect(cn("font-semibold", "font-mono")).toBe("font-semibold font-mono");
  });
});
