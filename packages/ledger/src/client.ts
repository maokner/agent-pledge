import { Client } from "xrpl";
import { loadConfig, type LedgerConfig } from "./config.js";
import { NetworkError } from "./errors.js";

let shared: { client: Client; config: LedgerConfig } | undefined;

/**
 * Returns a connected, shared xrpl.js Client.
 * Core owner (issue #3) may extend this with reconnect handling. Keep the signature stable.
 */
export async function getClient(config: LedgerConfig = loadConfig()): Promise<Client> {
  if (shared?.client.isConnected()) return shared.client;
  const client = new Client(config.XRPL_NETWORK_URL);
  try {
    await client.connect();
  } catch (cause) {
    throw new NetworkError(`Cannot connect to ${config.XRPL_NETWORK_URL}`, cause);
  }
  shared = { client, config };
  return client;
}

export async function disconnect(): Promise<void> {
  if (shared?.client.isConnected()) await shared.client.disconnect();
  shared = undefined;
}
