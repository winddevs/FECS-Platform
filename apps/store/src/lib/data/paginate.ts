// Medusa returns at most 100 rows per request; the page cap keeps a runaway
// catalogue from turning one request into thousands of API calls.
export const PAGE_SIZE = 100;
const MAX_PAGES = 100;

/**
 * Reads every page of a Medusa list endpoint and returns the rows in order.
 * Throws when the API fails, so callers decide what an outage means.
 */
export const collectPages = async <T>(
  fetchPage: (offset: number) => Promise<{ items: T[]; count: number }>
): Promise<T[]> => {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Pages depend on each other (the count decides when to stop).
    // oxlint-disable-next-line no-await-in-loop
    const { items, count } = await fetchPage(page * PAGE_SIZE);
    rows.push(...items);
    if (items.length < PAGE_SIZE || rows.length >= count) {
      break;
    }
  }

  return rows;
};
