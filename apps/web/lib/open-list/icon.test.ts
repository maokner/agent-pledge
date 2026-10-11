import { describe, expect, it } from "vitest";
import { subtaskIcon } from "./icon";

describe("subtaskIcon", () => {
  it("shows an armchair for a seat hold", () => {
    expect(subtaskIcon("Save a seat at the big table")).toBe("armchair");
    expect(subtaskIcon("Save two seats together")).toBe("armchair");
    expect(subtaskIcon("Grab a chair by the window")).toBe("armchair");
  });

  it("shows a beer for a drink run", () => {
    expect(subtaskIcon("Bring a cold beer to Memorial Glade")).toBe("beer");
    expect(subtaskIcon("Get me a DRINK from the cafe")).toBe("beer");
  });

  it("shows a palette for a design choice", () => {
    expect(subtaskIcon("Pick the better of two poster designs, A or B")).toBe("palette");
  });

  it("shows a pen for writing and editing", () => {
    expect(subtaskIcon("Edit a two-page essay by hand, no AI")).toBe("pen-line");
    expect(subtaskIcon("Proofread my essay")).toBe("pen-line");
  });

  it("matches whole words, so a word that only contains one does not count", () => {
    expect(subtaskIcon("Check my credit card statement")).toBe("sparkles");
    expect(subtaskIcon("Find the seathrough umbrella")).toBe("sparkles");
  });

  it("shows sparkles for anything else", () => {
    expect(subtaskIcon("Walk my dog around the block")).toBe("sparkles");
    expect(subtaskIcon("")).toBe("sparkles");
  });

  it("keeps a seat hold a seat hold when it mentions something else too", () => {
    expect(subtaskIcon("Save a seat and leave a beer on it")).toBe("armchair");
  });
});
