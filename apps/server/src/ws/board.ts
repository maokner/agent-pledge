// Owner: bundle B (#25). Board WebSocket /ws/board (public, read-only).
// On connect without ?since: send { type: "snapshot", seq, state }. With ?since=<seq>: send
// app.bus.since(seq) events, or a snapshot when it returns null. Then forward app.bus.subscribe events.
import type { FastifyPluginAsync } from "fastify";

const boardWs: FastifyPluginAsync = async (app) => {
  app.get("/ws/board", { websocket: true }, (socket) => {
    socket.close(1011, "not implemented");
  });
};

export default boardWs;
