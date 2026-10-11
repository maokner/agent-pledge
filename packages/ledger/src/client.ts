import { Client } from "xrpl";
import { loadConfig, type LedgerConfig } from "./config.js";
import { NetworkError } from "./errors.js";
import { ledgerEvents } from "./events.js";

export interface ConnectOptions {
  /** How long to wait for a healthy connection before throwing NetworkError. Default 20 s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
/** xrpl.js gives up on one connect attempt after this long. */
const CONNECT_ATTEMPT_TIMEOUT_MS = 8_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;

/** Exponential backoff with full jitter: attempt 0 waits up to 500 ms, then 1 s, 2 s, up to 15 s. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/** Resolves like `promise`, or rejects with `onTimeout()` after `ms`. Always clears its timer. */
async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keeps one xrpl.js Client connected. xrpl.js already retries once after an unexpected close, but
 * it stops after one failed attempt. This class keeps retrying with backoff until `close()`.
 */
class ManagedConnection {
  private closing = false;
  private connecting: Promise<void> | undefined;
  private everConnected = false;
  private lastError: unknown;
  private readonly detach: () => void;

  constructor(
    readonly client: Client,
    readonly url: string,
  ) {
    const onConnected = () => {
      ledgerEvents.emit("ledger.connected", { url, reconnected: this.everConnected });
      this.everConnected = true;
    };
    const onDisconnected = (code: number) => {
      if (this.closing) return;
      ledgerEvents.emit("ledger.disconnected", { url, code });
      void this.connectLoop(true);
    };
    // Listen on the Connection: Client re-emits "connected" once per reconnect listener it adds.
    client.connection.on("connected", onConnected);
    client.on("disconnected", onDisconnected);
    this.detach = () => {
      client.connection.off("connected", onConnected);
      client.off("disconnected", onDisconnected);
    };
  }

  /** Resolves when the client is connected. Throws NetworkError after `timeoutMs`; retries go on. */
  async ready(timeoutMs: number): Promise<void> {
    if (this.client.isConnected()) return;
    if (this.closing) throw new NetworkError(`Connection to ${this.url} is closed`);
    await withTimeout(
      this.connectLoop(false),
      timeoutMs,
      () =>
        new NetworkError(`No XRPL connection to ${this.url} after ${timeoutMs} ms`, this.lastError),
    );
  }

  /** One shared retry loop. `afterDrop` waits before the first try so xrpl.js can reconnect first. */
  private connectLoop(afterDrop: boolean): Promise<void> {
    if (this.connecting) return this.connecting;
    const loop = (async () => {
      for (let attempt = 0; ; attempt++) {
        if (afterDrop || attempt > 0) await sleep(backoffDelay(attempt));
        if (this.closing) throw new NetworkError(`Connection to ${this.url} is closed`);
        if (this.client.isConnected()) return;
        try {
          await this.client.connect();
          return;
        } catch (error) {
          this.lastError = error;
        }
      }
    })().finally(() => {
      this.connecting = undefined;
    });
    // Callers that timed out no longer await the loop. Keep its rejection from being unhandled.
    loop.catch(() => undefined);
    this.connecting = loop;
    return loop;
  }

  async close(): Promise<void> {
    this.closing = true;
    this.detach();
    await this.client.disconnect();
  }
}

let shared: ManagedConnection | undefined;
const managed = new WeakMap<Client, ManagedConnection>();

/**
 * Returns the shared xrpl.js Client, connected. If the connection dropped, waits for the automatic
 * reconnect. Throws NetworkError when no connection is possible within `timeoutMs`.
 * A different `XRPL_NETWORK_URL` replaces the shared client.
 */
export async function getClient(
  config: LedgerConfig = loadConfig(),
  options: ConnectOptions = {},
): Promise<Client> {
  const url = config.XRPL_NETWORK_URL;
  if (shared && shared.url !== url) await disconnect();
  if (!shared) {
    const client = new Client(url, { connectionTimeout: CONNECT_ATTEMPT_TIMEOUT_MS });
    shared = new ManagedConnection(client, url);
    managed.set(client, shared);
  }
  await shared.ready(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return shared.client;
}

/**
 * Waits until `client` is connected. For the shared client this joins its reconnect loop. For any
 * other client it tries `connect()` with backoff until `timeoutMs`.
 */
export async function ensureConnected(client: Client, options: ConnectOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const owner = managed.get(client);
  if (owner) return owner.ready(timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    if (client.isConnected()) return;
    try {
      await client.connect();
      return;
    } catch (error) {
      lastError = error;
    }
    await sleep(Math.min(backoffDelay(attempt), Math.max(0, deadline - Date.now())));
  }
  if (client.isConnected()) return;
  throw new NetworkError(`No XRPL connection to ${client.url} after ${timeoutMs} ms`, lastError);
}

/** Closes the shared client and stops reconnecting. The next getClient() opens a new one. */
export async function disconnect(): Promise<void> {
  const current = shared;
  shared = undefined;
  if (current) {
    managed.delete(current.client);
    await current.close();
  }
}
