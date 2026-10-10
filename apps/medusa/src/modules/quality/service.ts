import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../lib/errors";
import { TOPICS } from "../../lib/events/envelope";
import {
  drainOutbox,
  newId,
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import { fromUnits, toUnits } from "../../lib/quantity";
import { executorOf, outboxRowFor, runIdempotent } from "../../lib/tx";
import {
  QUALITY_IDEMPOTENCY_TABLE,
  QUALITY_OUTBOX_TABLE,
  QualityIdempotencyRecord,
  QualityInspection,
  QualityOutboxEvent,
} from "./models/inspection";
import type { InspectionResult, RecordInspectionInput } from "./types";

class QualityModuleService extends MedusaService({
  QualityInspection,
  QualityOutboxEvent,
  QualityIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  @InjectTransactionManager()
  async recordInspection(
    input: RecordInspectionInput,
    @MedusaContext() ctx: Context = {}
  ): Promise<InspectionResult> {
    return await runIdempotent(
      ctx,
      QUALITY_IDEMPOTENCY_TABLE,
      "inspect",
      input,
      async () => {
        const pass = toUnits(input.pass_qty);
        const rework = toUnits(input.rework_qty ?? 0);
        const reject = toUnits(input.reject_qty ?? 0);
        const hold = toUnits(input.hold_qty ?? 0);
        const total = pass + rework + reject + hold;
        if (
          total <= 0 ||
          [pass, rework, reject, hold].some((value) => value < 0)
        ) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            "An inspection needs non-negative quantities that add up to more than zero"
          );
        }

        const inspectionNo = `QC-${(newId("qc").split("_")[1] ?? "").slice(-8)}`;
        const inspection = await this.createQualityInspections(
          {
            inspection_no: inspectionNo,
            target_type: input.target_type,
            target_id: input.target_id,
            reference_type: input.reference_type ?? null,
            reference_id: input.reference_id ?? null,
            qty_inspected: fromUnits(total),
            pass_qty: fromUnits(pass),
            rework_qty: fromUnits(rework),
            reject_qty: fromUnits(reject),
            hold_qty: fromUnits(hold),
            defects: (input.defects ?? null) as unknown as Record<
              string,
              unknown
            > | null,
            notes: input.notes ?? null,
            inspector_id: input.actor_id,
          },
          ctx
        );

        const result: InspectionResult = {
          id: inspection.id,
          inspection_no: inspectionNo,
          target_type: input.target_type,
          target_id: input.target_id,
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null,
          qty_inspected: fromUnits(total),
          pass_qty: fromUnits(pass),
          rework_qty: fromUnits(rework),
          reject_qty: fromUnits(reject),
          hold_qty: fromUnits(hold),
        };

        await this.createQualityOutboxEvents(
          [
            outboxRowFor({
              eventType: "quality.inspection_completed.v1",
              aggregateType: "quality_inspection",
              aggregateId: inspection.id,
              producer: "quality",
              topic: TOPICS.quality,
              actor: input,
              data: result,
            }),
          ],
          ctx
        );
        return result;
      }
    );
  }

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      executorOf(ctx),
      QUALITY_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default QualityModuleService;
