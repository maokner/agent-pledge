/**
 * The real server's wire types, taken from the server's contract package
 * (`@agent-pledge/shared`, zod schemas in packages/shared/src, documented in
 * docs/api.md). The aliases keep the adapter's `Backend*` names, so it is
 * always clear which side of the adapter a value is on.
 *
 * Only types are imported, so none of the package's runtime (zod) reaches the
 * browser bundle. The rest of the web app never imports these: lib/backend maps
 * them into the web app's own types (lib/contract).
 */
import type {
  AgentLogEntry,
  AgentLogLevel,
  ApiError,
  BoardEvent,
  BoardEventData,
  BoardEventType,
  BoardServerMessage,
  BoardSnapshotMessage,
  BoardState,
  ClaimSubtaskResponse,
  ClaimView,
  CreateTaskResponse,
  Currency,
  IsoTime,
  MediaKind,
  MediaView,
  Money,
  NftUriData,
  PayResponse,
  PhotoResponse,
  PinErrorDetails,
  PinResponse,
  PinState,
  SubtaskStatus,
  SubtaskView,
  TaskStatus,
  TaskView,
  TxKind,
  TxStatus,
  TxView,
} from "@agent-pledge/shared";

/** "5.00": always two decimals. */
export type BackendMoney = Money;
/** ISO 8601 UTC. */
export type BackendIsoTime = IsoTime;

export type BackendTaskStatus = TaskStatus;
export type BackendSubtaskStatus = SubtaskStatus;
export type BackendTxStatus = TxStatus;
export type BackendTxKind = TxKind;
export type BackendCurrency = Currency;
export type BackendMediaKind = MediaKind;
export type BackendAgentLogLevel = AgentLogLevel;

export type BackendTxView = TxView;
/** `url` is `${PUBLIC_API_URL}/media/${id}`. */
export type BackendMediaView = MediaView;
/** PIN state. Lives on the task, not the sub-task. */
export type BackendPinState = PinState;
/** No description, place or time limit: those come from the parent task. */
export type BackendSubtaskView = SubtaskView;
export type BackendTaskView = TaskView;
export type BackendAgentLogEntry = AgentLogEntry;
/** GET /board/state, and the `state` of the socket's snapshot message. */
export type BackendBoardState = BoardState;

/** GET /claim/:code. No server_time. */
export type BackendClaimView = ClaimView;
export type BackendPayout = NonNullable<ClaimView["payout"]>;
/** POST /claim/:code/claim */
export type BackendClaimSubtaskResponse = ClaimSubtaskResponse;
/** POST /claim/:code/photo. `payout` is set when the photo paid the helper. */
export type BackendPhotoResponse = PhotoResponse;
/** POST /claim/:code/pay */
export type BackendPayResponse = PayResponse;
/** The sub-task NFT on a claim view. */
export type BackendClaimNft = NonNullable<ClaimView["nft"]>;
/** POST /claim/:code/pin, 200 */
export type BackendPinResponse = PinResponse;
/** 422 wrong_pin and 423 pin_locked `details`. */
export type BackendPinErrorDetails = PinErrorDetails;
/** Every error body. */
export type BackendApiError = ApiError;

/** GET /tasks/:id.json */
export type BackendNftUriData = NftUriData;
/** POST /tools/create_task, 200. `board_url` is `${PUBLIC_BASE_URL}/?task=<id>`. */
export type BackendCreateTaskResponse = CreateTaskResponse;

/** The `data` of each board socket event. */
export type BackendBoardEventData = BoardEventData;
export type BackendBoardEventType = BoardEventType;
export type BackendBoardEvent = BoardEvent;
/** Sent on connect without `since`, and when a reconnecting client is too far behind or the server restarted. */
export type BackendBoardSnapshotMessage = BoardSnapshotMessage;
export type BackendBoardServerMessage = BoardServerMessage;
