/**
 * The /human list without a `GET /subtasks/open`: the server has no such
 * endpoint yet (the DRAFT proposes one, see packages/shared/CONTRACT.md), so
 * the client derives the list from `GET /board/state`.
 */
import type { ListOpenSubtasksResponse } from "@agent-pledge/shared";
import { subtasksOf } from "./board";
import type { BackendBoardState } from "./types";

/**
 * Sub-tasks a helper can claim right now: status open, the vault's offer made
 * (`offer_id`; before that the server answers a claim with 409 conflict), and
 * the deadline after the board's `generated_at`, which stands in for
 * server_time. The text, place and time limit come from the parent task.
 */
export function openSubtasksFromBackend(state: BackendBoardState): ListOpenSubtasksResponse {
  const serverTime = Date.parse(state.generated_at);
  const subtasks = (state.tasks ?? []).flatMap((task) => {
    const claimable = new Set(
      (task.subtasks ?? []).filter((sub) => sub.status === "open" && sub.offer_id && Date.parse(sub.deadline) > serverTime).map((sub) => sub.id),
    );
    return subtasksOf(task)
      .filter((sub) => claimable.has(sub.id))
      .map((sub) => ({
        claim_code: sub.claim_code,
        price: sub.price,
        description: sub.description,
        place: sub.place,
        time_limit_minutes: sub.time_limit_minutes,
        created_at: sub.created_at,
        deadline_at: sub.deadline_at,
      }));
  });
  return { server_time: state.generated_at, subtasks };
}
