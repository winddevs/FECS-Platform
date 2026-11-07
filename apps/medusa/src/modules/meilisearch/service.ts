type MeilisearchOptions = {
  /** Base URL of the Meilisearch server, e.g. http://meilisearch:7700 */
  host: string;
  /** Master (or admin) key. Optional only in development, where the server runs without one. */
  apiKey?: string;
  productIndexName: string;
};

export type MeilisearchIndexType = "product";

type Document = Record<string, unknown>;

type SearchResponse = {
  hits: Document[];
  estimatedTotalHits?: number;
  processingTimeMs?: number;
};

const REQUEST_TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 20;
const NOT_FOUND = 404;

/** Fields people search in. Order matters: earlier fields rank higher. */
const SEARCHABLE_ATTRIBUTES = [
  "title",
  "handle",
  "description",
  "categories.name",
  "tags.value",
] as const;

class MeilisearchError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "MeilisearchError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Thin client over the Meilisearch REST API (plain fetch, no extra package).
 *
 * The public methods keep the shape of the Algolia module this replaces, and
 * `search` returns the same `{ results: [{ hits, nbHits, ... }] }` envelope, so
 * the storefront search box and its /api/search proxy need no change.
 *
 * Meilisearch applies writes as background tasks: a successful call means the
 * task was queued, and the change is searchable a moment later.
 */
export default class MeilisearchModuleService {
  private readonly options: MeilisearchOptions;
  private ready: Promise<void> | null = null;

  // Medusa passes the container first; this service does not use it.
  constructor(_container: unknown, options: MeilisearchOptions) {
    this.options = {
      ...options,
      host: (options.host || "").replace(/\/+$/, ""),
    };
  }

  async getIndexName(type: MeilisearchIndexType): Promise<string> {
    switch (type) {
      case "product":
        return this.options.productIndexName;
      default:
        throw new Error(`Invalid index type: ${type}`);
    }
  }

  async indexData(
    data: Document[],
    type: MeilisearchIndexType = "product"
  ): Promise<void> {
    if (data.length === 0) {
      return;
    }
    const uid = await this.getIndexName(type);
    await this.ensureIndex(uid);
    // Adding a document with an existing id replaces it, so this is an upsert.
    await this.request(
      "POST",
      `/indexes/${encodeURIComponent(uid)}/documents?primaryKey=id`,
      data
    );
  }

  /** Returns the documents that exist for these ids (missing ones are left out). */
  async retrieveFromIndex(
    ids: string[],
    type: MeilisearchIndexType = "product"
  ): Promise<Document[]> {
    const uid = await this.getIndexName(type);
    const found = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.request<Document>(
            "GET",
            `/indexes/${encodeURIComponent(uid)}/documents/${encodeURIComponent(id)}`
          );
        } catch (error) {
          if (error instanceof MeilisearchError && error.status === NOT_FOUND) {
            return null;
          }
          throw error;
        }
      })
    );
    return found.filter((doc): doc is Document => doc !== null);
  }

  async deleteFromIndex(
    ids: string[],
    type: MeilisearchIndexType = "product"
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const uid = await this.getIndexName(type);
    try {
      await this.request(
        "POST",
        `/indexes/${encodeURIComponent(uid)}/documents/delete-batch`,
        ids
      );
    } catch (error) {
      // Nothing to delete when the index was never created.
      if (!(error instanceof MeilisearchError && error.status === NOT_FOUND)) {
        throw error;
      }
    }
  }

  async search(query: string, type: MeilisearchIndexType = "product") {
    const uid = await this.getIndexName(type);
    let response: SearchResponse;
    try {
      response = await this.request<SearchResponse>(
        "POST",
        `/indexes/${encodeURIComponent(uid)}/search`,
        { q: query, limit: SEARCH_LIMIT }
      );
    } catch (error) {
      // No product has been indexed yet: an empty result, not an error.
      if (error instanceof MeilisearchError && error.status === NOT_FOUND) {
        response = { hits: [], estimatedTotalHits: 0, processingTimeMs: 0 };
      } else {
        throw error;
      }
    }

    // Same envelope Algolia returned. `objectID` is what react-instantsearch
    // uses as the React key of each hit.
    const hits = response.hits.map((hit) => ({ ...hit, objectID: hit.id }));
    return {
      results: [
        {
          hits,
          nbHits: response.estimatedTotalHits ?? hits.length,
          nbPages: 1,
          page: 0,
          hitsPerPage: SEARCH_LIMIT,
          processingTimeMS: response.processingTimeMs ?? 0,
          query,
          params: "",
        },
      ],
    };
  }

  /** Create the index settings once per process (the call is idempotent). */
  private ensureIndex(uid: string): Promise<void> {
    if (!this.ready) {
      this.ready = this.request(
        "PATCH",
        `/indexes/${encodeURIComponent(uid)}/settings`,
        { searchableAttributes: [...SEARCHABLE_ATTRIBUTES] }
      )
        .then(() => undefined)
        .catch((error: unknown) => {
          // Try again on the next write instead of caching the failure.
          this.ready = null;
          throw error;
        });
    }
    return this.ready;
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.options.host) {
      throw new Error("MEILISEARCH_HOST is not set");
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.options.host}${path}`, init);

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : response.statusText;
      const code = typeof payload.code === "string" ? payload.code : undefined;
      throw new MeilisearchError(
        response.status,
        code,
        `Meilisearch ${method} ${path} failed (${response.status}): ${message}`
      );
    }
    return payload as T;
  }
}
