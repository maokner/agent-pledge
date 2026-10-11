// Owner: bundle B (#25). Board WebSocket /ws/board (public, read-only).
// On connect without ?since: send { type: "snapshot", seq, state }. With ?since=<seq>: send
// app.bus.since(seq) events, or a snapshot when it returns null. Then forward live bus events.
import type { BoardEvent, BoardServerMessage } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import { loadBoardState } from "../lib/views";

const PING_MS = 25_000;

const boardWs: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { since?: string } }>("/ws/board", { websocket: true }, (socket, req) => {
    const send = (m: BoardServerMessage) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(m));
    };

    // Subscribe first and buffer, so nothing published while the snapshot loads is lost.
    let buffered: BoardEvent[] | null = [];
    let lastSent = -Infinity;
    const forward = (e: BoardEvent) => {
      if (e.seq <= lastSent) return;
      lastSent = e.seq;
      send(e);
    };
    const unsubscribe = app.bus.subscribe((e) => {
      if (buffered) buffered.push(e);
      else forward(e);
    });
    const ping = setInterval(() => socket.readyState === 1 && socket.ping(), PING_MS);
    ping.unref();
    socket.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
    // Read-only: ignore anything the client sends.
    socket.on("message", () => {});

    const flush = () => {
      const pending = buffered ?? [];
      buffered = null;
      for (const e of pending) forward(e);
    };

    const sinceRaw = req.query.since;
    const since = sinceRaw != null && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : null;
    if (since != null) {
      const missed = app.bus.since(since);
      if (missed) {
        lastSent = since;
        for (const e of missed) forward(e);
        flush();
        return;
      }
    }

    const seq = app.bus.latestSeq;
    loadBoardState(app.db, app.viewCtx, seq, app.clock.now())
      .then((state) => {
        send({ type: "snapshot", seq, state });
        lastSent = seq;
        flush();
      })
      .catch((err) => {
        req.log.error({ err }, "board snapshot failed");
        socket.close(1011, "snapshot failed");
      });
  });
};

export default boardWs;
