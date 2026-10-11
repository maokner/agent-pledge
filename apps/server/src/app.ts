import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import {
  AlreadyClaimedError,
  ErrorCode,
  LedgerError,
  LedgerNetworkError,
  newId,
} from "@agent-pledge/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { wallets } from "./db/schema";
import { AgentChannel } from "./events/agent-channel";
import { EventBus } from "./events/bus";
import { bridgeLedgerEvents, type LedgerBridge } from "./events/ledger-bridge";
import type { LedgerHandle } from "./ledger";
import { systemClock, type Clock } from "./lib/clock";
import { HttpError, sendError } from "./lib/http";
import type { ViewCtx } from "./lib/views";
import adminRoutes from "./routes/admin";
import agentRoutes from "./routes/agent";
import boardRoutes from "./routes/board";
import claimRoutes from "./routes/claim";
import healthRoutes from "./routes/health";
import mediaRoutes from "./routes/media";
import pinRoutes from "./routes/pin";
import tasksJsonRoutes from "./routes/tasks-json";
import toolsRoutes from "./routes/tools";
import agentWs from "./ws/agent";
import boardWs from "./ws/board";

export interface AppDeps {
  config: Config;
  db: Db;
  ledger: LedgerHandle;
  clock?: Clock;
  bus?: EventBus;
  logger?: FastifyServerOptions["logger"];
}

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: Db;
    ledger: LedgerHandle;
    clock: Clock;
    bus: EventBus;
    agentChannel: AgentChannel;
    ledgerBridge: LedgerBridge;
    /** Pass to the mappers/loaders in lib/views.ts. */
    viewCtx: ViewCtx;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db, ledger } = deps;
  const clock = deps.clock ?? systemClock;
  const app = Fastify({
    logger:
      deps.logger ??
      (config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            ...(config.NODE_ENV === "development"
              ? {
                  transport: {
                    target: "pino-pretty",
                    options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
                  },
                }
              : {}),
          }),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const bus = deps.bus ?? new EventBus(clock);
  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("ledger", ledger);
  app.decorate("clock", clock);
  app.decorate("bus", bus);
  app.decorate("agentChannel", new AgentChannel());
  app.decorate("viewCtx", {
    config,
    explorerNftUrl: (id: string) => ledger.port.explorerNftUrl(id),
    vaultAddress: ledger.vaultAddress,
    agentAddress: ledger.agentAddress,
  } satisfies ViewCtx);
  const bridge = bridgeLedgerEvents({ ledger: ledger.port, db, bus, clock, log: app.log });
  app.decorate("ledgerBridge", bridge);
  app.addHook("onClose", async () => bridge.unsubscribe());

  await app.register(cors, {
    origin: config.CORS_ORIGINS.includes("*") ? true : config.CORS_ORIGINS,
    credentials: true,
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError)
      return sendError(reply, err.statusCode, err.code, err.message, err.details);
    if (err instanceof AlreadyClaimedError)
      return sendError(reply, 409, ErrorCode.alreadyClaimed, "Already claimed");
    if (err instanceof LedgerError) {
      req.log.error({ err }, "ledger error");
      const msg =
        err instanceof LedgerNetworkError ? "Ledger network error, try again" : err.message;
      return sendError(reply, 502, ErrorCode.ledgerError, msg);
    }
    const e = err as { statusCode?: number; validation?: unknown; code?: string; message: string };
    if (e.validation) return sendError(reply, 400, ErrorCode.badRequest, e.message);
    if (e.statusCode && e.statusCode < 500)
      return sendError(reply, e.statusCode, e.code ?? "error", e.message);
    req.log.error({ err }, "unhandled error");
    return sendError(reply, 500, "internal", "Internal server error");
  });

  // Record the system wallets (no seeds) so the wallets table has every role.
  app.addHook("onReady", async () => {
    await db
      .insert(wallets)
      .values([
        { id: newId("wal"), role: "vault", address: ledger.vaultAddress },
        { id: newId("wal"), role: "agent", address: ledger.agentAddress },
      ])
      .onConflictDoNothing({ target: wallets.address });
  });

  await app.register(healthRoutes);
  await app.register(toolsRoutes);
  await app.register(agentRoutes);
  await app.register(agentWs);
  await app.register(boardRoutes);
  await app.register(boardWs);
  await app.register(tasksJsonRoutes);
  await app.register(claimRoutes);
  await app.register(mediaRoutes);
  await app.register(pinRoutes);
  await app.register(adminRoutes);

  return app;
}
