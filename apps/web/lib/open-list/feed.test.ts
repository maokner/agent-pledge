import type { ListOpenSubtasksResponse, OpenSubtaskSummary } from "@agent-pledge/shared";
import { describe, expect, it } from "vitest";
import { INITIAL_OPEN_LIST, openListReducer, type OpenListState } from "./feed";

const SERVER_NOW = Date.parse("2026-10-11T19:00:00.000Z");

function item(claim_code: string, description = "Save a seat"): OpenSubtaskSummary {
  return {
    claim_code,
    price: "4",
    description,
    place: "Main Stacks",
    time_limit_minutes: 10,
    created_at: "2026-10-11T18:55:00.000Z",
    deadline_at: "2026-10-11T19:05:00.000Z",
  };
}

function response(...subtasks: OpenSubtaskSummary[]): ListOpenSubtasksResponse {
  return { server_time: new Date(SERVER_NOW).toISOString(), subtasks };
}

/** The phone's clock is 2 s behind the server's. */
const RECEIVED_AT = SERVER_NOW - 2000;

function loaded(state: OpenListState, res: ListOpenSubtasksResponse): OpenListState {
  return openListReducer(state, { type: "loaded", response: res, receivedAt: RECEIVED_AT });
}

describe("openListReducer", () => {
  it("shows the first list with the server clock offset", () => {
    const state = loaded(INITIAL_OPEN_LIST, response(item("OPEN"), item("RACE")));
    expect(state).toMatchObject({ status: "ready", offsetMs: 2000, failures: 0, announcement: null });
    expect(state.status === "ready" && state.subtasks.map((s) => s.claim_code)).toEqual(["OPEN", "RACE"]);
  });

  it("announces a sub-task that arrives on a later load, and clears the message when nothing is new", () => {
    const first = loaded(INITIAL_OPEN_LIST, response(item("OPEN")));
    const second = loaded(first, response(item("OPEN"), item("NEW1", "Bring a cold beer")));
    expect(second).toMatchObject({ announcement: "New sub-task: $4.00, Bring a cold beer" });
    expect(loaded(second, response(item("OPEN"), item("NEW1", "Bring a cold beer")))).toMatchObject({ announcement: null });
  });

  it("lets only the first list fade in, not sub-tasks that arrive later", () => {
    const first = loaded(INITIAL_OPEN_LIST, response(item("OPEN"), item("RACE")));
    const later = loaded(first, response(item("OPEN"), item("NEW1")));
    expect(first).toMatchObject({ entering: ["OPEN", "RACE"] });
    expect(later).toMatchObject({ entering: ["OPEN", "RACE"] });
  });

  it("keeps the last list when a refresh fails, and counts the failures until one works", () => {
    const ready = loaded(INITIAL_OPEN_LIST, response(item("OPEN")));
    const once = openListReducer(ready, { type: "failed" });
    const twice = openListReducer(once, { type: "failed" });
    expect(twice).toMatchObject({ status: "ready", failures: 2, offsetMs: 2000 });
    expect(twice.status === "ready" && twice.subtasks.map((s) => s.claim_code)).toEqual(["OPEN"]);
    expect(loaded(twice, response(item("OPEN")))).toMatchObject({ status: "ready", failures: 0 });
  });

  it("shows an error when the first load fails, and goes back to loading on Try again", () => {
    const failed = openListReducer(INITIAL_OPEN_LIST, { type: "failed" });
    expect(failed).toEqual({ status: "error", failures: 1 });
    expect(openListReducer(failed, { type: "failed" })).toEqual({ status: "error", failures: 2 });
    expect(openListReducer(failed, { type: "retry" })).toEqual(INITIAL_OPEN_LIST);
  });

  it("does not announce the list that finally loads after an error", () => {
    const failed = openListReducer(INITIAL_OPEN_LIST, { type: "failed" });
    expect(loaded(failed, response(item("OPEN")))).toMatchObject({ status: "ready", announcement: null });
  });
});
