import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { recordAuditStep } from "./steps/fashion-audit";
import {
  createLinkCodeStep,
  sendAgentMessageStep,
  setHandoffStep,
} from "./steps/social";

export const createLinkCodeWorkflow = createWorkflow(
  "social-create-link-code-workflow",
  function (input: { customer_id: string }) {
    return new WorkflowResponse(createLinkCodeStep(input));
  }
);

export const setHandoffWorkflow = createWorkflow(
  "social-set-handoff-workflow",
  function (input: {
    identity_id: string;
    state: "BOT" | "HUMAN";
    actor_id: string;
    correlation_id?: string | null;
  }) {
    const result = setHandoffStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: `social.handoff.${input.state.toLowerCase()}`,
      resource_type: "customer_channel_identity",
      resource_id: input.identity_id,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const sendAgentMessageWorkflow = createWorkflow(
  "social-send-agent-message-workflow",
  function (input: {
    identity_id: string;
    text: string;
    actor_id: string;
    correlation_id?: string | null;
  }) {
    const result = sendAgentMessageStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "social.agent_message.send",
      resource_type: "customer_channel_identity",
      resource_id: input.identity_id,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);
