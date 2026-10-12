import type { Config } from "../config";

const trim = (u: string) => u.replace(/\/+$/, "");

/** <PUBLIC_BASE_URL>/c/<CODE> */
export const claimUrl = (cfg: Config, code: string) => `${trim(cfg.PUBLIC_BASE_URL)}/c/${code}`;
/** The board. With a task ID: <PUBLIC_BASE_URL>/?task=<id>. */
export const boardUrl = (cfg: Config, taskId?: string) =>
  taskId ? `${trim(cfg.PUBLIC_BASE_URL)}/?task=${taskId}` : `${trim(cfg.PUBLIC_BASE_URL)}/`;
/** NFT URI target: <PUBLIC_API_URL>/tasks/<task or sub-task id>.json */
export const nftUri = (cfg: Config, id: string) => `${trim(cfg.PUBLIC_API_URL)}/tasks/${id}.json`;
/** <PUBLIC_API_URL>/media/<id> */
export const mediaUrl = (cfg: Config, id: string) => `${trim(cfg.PUBLIC_API_URL)}/media/${id}`;
/** The XRPL explorer page of an account: <XRPL_EXPLORER_URL>/accounts/<address> */
export const explorerAccountUrl = (cfg: Config, address: string) =>
  `${trim(cfg.XRPL_EXPLORER_URL)}/accounts/${address}`;
