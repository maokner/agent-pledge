// Owner: bundle B (#20). Local agent WebSocket /ws/agent. Auth: Bearer AGENT_TOKEN or ?token=.
// Attach sockets to app.agentChannel. On connect: resend task.new for tasks with agent_acked_at null,
// and task.redeemable for redeemable unpaid tasks. On { type: "ack", task_id }: set agent_acked_at.
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";

const agentWs: FastifyPluginAsync = async (app) => {
  app.get("/ws/agent", { websocket: true, preValidation: requireAgentToken }, (socket) => {
    socket.close(1011, "not implemented");
  });
};

export default agentWs;
