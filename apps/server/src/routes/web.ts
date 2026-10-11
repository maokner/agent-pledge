// The board, the claim page and the rest of the web app (apps/web, Next.js) are served through this
// server, so that the pages, the JSON API and /ws/board share one public origin: one tunnel URL,
// claim links that open on any phone, and no CORS.
//
// Every path that is not an API route is reverse-proxied to the Next.js server at WEB_UPSTREAM_URL
// (default http://localhost:3000). The API routes are registered as static or parametric routes,
// which the router always prefers over the proxy's catch-all, so none of them can be shadowed.
// Unknown paths under the API's own prefixes keep the API's JSON 404 instead of a Next.js page.
// With WEB_UPSTREAM_URL empty, nothing is proxied and only the API is served.
import httpProxy from "@fastify/http-proxy";
import { ErrorCode, type ApiError } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import type { IncomingHttpHeaders as Http2IncomingHttpHeaders } from "node:http2";
import { sendError } from "../lib/http";

/** Path prefixes that belong to the API. Next.js serves nothing under them. */
export const API_PREFIXES = ["agent", "tools", "claim", "admin", "media", "ws", "tasks"] as const;

/** Every method but OPTIONS: @fastify/cors owns OPTIONS for CORS preflights. */
const PROXY_METHODS = ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"];

/**
 * Next.js dev server's hot reload sockets (`next dev` only; `next start` never opens them):
 * /_next/hmr with Turbopack (Next 16), /_next/webpack-hmr with webpack.
 */
export const NEXT_HMR_PATHS = ["/_next/hmr", "/_next/webpack-hmr"] as const;

type Headers = IncomingHttpHeaders | Http2IncomingHttpHeaders;

/** Tell Next.js the public host and scheme, since the proxy rewrites Host to the upstream's. */
export function forwardedHeaders(
  headers: Headers,
  req: { headers: Headers; protocol: string; ip: string; ips?: string[] },
): Headers {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return {
    ...headers,
    ...(host ? { "x-forwarded-host": host } : {}),
    "x-forwarded-proto": req.protocol,
    "x-forwarded-for": req.ips?.join(", ") ?? req.ip,
  };
}

const webRoutes: FastifyPluginAsync = async (app) => {
  for (const prefix of API_PREFIXES) {
    app.route({
      method: PROXY_METHODS,
      url: `/${prefix}/*`,
      handler: (_req, reply) => sendError(reply, 404, ErrorCode.notFound, "Not found"),
    });
  }

  const upstream = app.config.WEB_UPSTREAM_URL;
  if (!upstream) {
    app.log.warn("WEB_UPSTREAM_URL is empty: the web app (board, claim page) is not served");
    return;
  }

  // Pages, static assets, /_next/*, and the web app's own route handlers (/api/*).
  await app.register(httpProxy, {
    upstream,
    prefix: "/",
    httpMethods: PROXY_METHODS,
    replyOptions: {
      rewriteRequestHeaders: (req, headers) => forwardedHeaders(headers, req),
      onError: (reply, { error }) => {
        reply.log.warn({ err: error, upstream }, "web app unreachable");
        const body: ApiError = {
          error: "web_unavailable",
          message: `The web app is not answering at ${upstream}. Start it (pnpm dev:web) or set WEB_UPSTREAM_URL.`,
        };
        void reply.code(502).send(body);
      },
    },
  });

  // `next dev` hot reload. Scoped to its own paths so the proxy never claims /ws/board or /ws/agent.
  for (const path of NEXT_HMR_PATHS) {
    await app.register(httpProxy, {
      upstream,
      prefix: path,
      rewritePrefix: path,
      httpMethods: ["GET"],
      websocket: true,
    });
  }

  app.log.info({ upstream }, "web app proxied");
};

export default webRoutes;
