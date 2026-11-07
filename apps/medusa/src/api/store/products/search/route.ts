import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";

import { MEILISEARCH_MODULE } from "../../../../modules/meilisearch";
import MeilisearchModuleService from "../../../../modules/meilisearch/service";

export const SearchSchema = z.object({
  query: z.string(),
});

type SearchRequest = z.infer<typeof SearchSchema>;

export async function POST(
  req: MedusaRequest<SearchRequest>,
  res: MedusaResponse
) {
  const searchService: MeilisearchModuleService =
    req.scope.resolve(MEILISEARCH_MODULE);

  const { query } = req.validatedBody;

  const results = await searchService.search(query as string);

  res.json(results);
}
