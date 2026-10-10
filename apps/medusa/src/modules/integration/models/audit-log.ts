import { model } from "@medusajs/framework/utils";

/**
 * Append-only audit trail for high-risk actions (FR-ADM-003, NFR-AUD-002).
 * A database trigger (see migrations) rejects UPDATE/DELETE.
 */
export const AuditLog = model
  .define("audit_log", {
    id: model.id({ prefix: "aud" }).primaryKey(),
    actor_id: model.text(),
    action: model.text(),
    resource_type: model.text(),
    resource_id: model.text(),
    reason: model.text().nullable(),
    before: model.json().nullable(),
    after: model.json().nullable(),
    correlation_id: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_audit_log_resource", on: ["resource_type", "resource_id"] },
    { name: "IDX_audit_log_actor", on: ["actor_id"] },
    { name: "IDX_audit_log_action", on: ["action"] },
  ]);
