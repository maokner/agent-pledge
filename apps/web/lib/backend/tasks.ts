/** The real server's create_task response and NFT URI data, as the web app's types. */
import type { CreateTaskResponse, TaskNftData } from "@/lib/contract";
import type { BackendCreateTaskResponse, BackendNftUriData } from "./types";

export function createTaskResponseFromBackend(
  response: BackendCreateTaskResponse,
): CreateTaskResponse {
  return {
    task_id: response.task_id,
    pin: response.pin,
    board_url: response.board_url,
    status: response.status,
    price: response.price,
    deadline_at: response.deadline,
  };
}

/** GET /tasks/:id.json. The server sends no time limit or creation time, so those are null. */
export function taskNftDataFromBackend(data: BackendNftUriData): TaskNftData {
  return {
    id: data.id,
    type: data.kind,
    description: data.description,
    place: data.place,
    time_limit_minutes: null,
    price: data.price,
    created_at: null,
    deadline_at: data.deadline,
    status: data.status,
    nft_id: data.nft_id,
    parent_task_id: data.parent_task_id,
    parent_nft_id: data.parent_nft_id,
    board_url: data.board_url,
  };
}
