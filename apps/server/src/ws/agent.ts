// Owner: bundle B (#20). Local agent WebSocket /ws/agent. Auth: Bearer AGENT_TOKEN or ?token=.
// Attaches sockets to app.agentChannel. On connect: resends task.new for tasks with agent_acked_at
// null, and task.redeemable for redeemable unpaid tasks. On { type: "ack", task_id }: sets agent_acked_at.
import { AgentClientMessage, type AgentServerMessage } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { ackTask, pendingRedeemables, unackedTaskNews } from "../services/tasks";

const PING_MS = 25_000;

const agentWs: FastifyPluginAsync = async (app) => {
  app.get("/ws/agent", { websocket: true, preValidation: requireAgentToken }, (socket, req) => {
    const detach = app.agentChannel.attach(socket);
    const ping = setInterval(() => socket.readyState === 1 && socket.ping(), PING_MS);
    ping.unref();
    socket.on("close", () => {
      clearInterval(ping);
      detach();
    });

    const send = (m: AgentServerMessage) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(m));
    };

    socket.on("message", (raw) => {
      let msg: AgentClientMessage;
      try {
        const parsed = AgentClientMessage.safeParse(JSON.parse(String(raw)));
        if (!parsed.success) return;
        msg = parsed.data;
      } catch {
        return;
      }
      if (msg.type === "hello") {
        req.log.info({ agent: msg.agent_address, version: msg.version }, "local agent hello");
      } else if (msg.type === "ack") {
        ackTask(app, msg.task_id).catch((err) => req.log.error({ err }, "agent ack failed"));
      }
    });

    // Resend what the agent missed while it was away.
    (async () => {
      for (const m of await unackedTaskNews(app)) send(m);
      for (const m of await pendingRedeemables(app)) send(m);
    })().catch((err) => req.log.error({ err }, "agent resend failed"));
  });
};

export default agentWs;
