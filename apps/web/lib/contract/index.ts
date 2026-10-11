/**
 * The web app's internal model (lib/contract, formerly the DRAFT @agent-pledge/shared).
 *
 * DRAFT CONTRACT, pending backend review for issue #17. See ./CONTRACT.md.
 * Written by the front end so the board and claim page (#31) can start
 * before the server exists. The backend owns the final version.
 */
export * from "./common.ts";
export * from "./entities.ts";
export * from "./http.ts";
export * from "./events.ts";
