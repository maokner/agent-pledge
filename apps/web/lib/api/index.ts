import { API_URL, FIXTURE_MODE } from "../config";
import type { ApiClient } from "./client";
import { createFixtureApiClient } from "./fixture-client";
import { createHttpApiClient } from "./http-client";

export { ApiError, errorMessage, type ApiClient } from "./client";

let client: ApiClient | null = null;

/** The fixture client when NEXT_PUBLIC_FIXTURES=1, else the HTTP client for NEXT_PUBLIC_API_URL. */
export function getApiClient(): ApiClient {
  client ??= FIXTURE_MODE ? createFixtureApiClient() : createHttpApiClient({ baseUrl: API_URL });
  return client;
}
