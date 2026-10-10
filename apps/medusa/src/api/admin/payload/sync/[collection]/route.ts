import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

/**
 * Collections that have a `<collection>.sync-payload` subscriber. The path
 * segment is user input, so it must never become an arbitrary event name.
 */
const SYNCABLE_COLLECTIONS = new Set(["products"]);

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { collection } = req.params;
  if (!SYNCABLE_COLLECTIONS.has(collection)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Unknown collection",
      "NOT_FOUND"
    );
  }
  const eventModuleService = req.scope.resolve("event_bus");
  await eventModuleService.emit({
    name: `${collection}.sync-payload`,
    data: {},
  });
  return res.status(200).json({
    message: `Syncing ${collection} with Payload`,
  });
};
