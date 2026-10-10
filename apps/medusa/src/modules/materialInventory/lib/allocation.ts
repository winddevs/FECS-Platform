/**
 * Pure allocation planner for material reservations (FR-INV-005/006,
 * TDD section 11). All quantities are scaled integers (see lib/quantity).
 *
 * Strategy (SAME_DYE_LOT_FIFO):
 *  1. Prefer one dye lot able to satisfy the whole requirement (oldest first).
 *  2. Otherwise use as few dye lots as possible; if that exceeds the material's
 *     `max_dye_lots` the plan is flagged for planner approval.
 *  3. Inside a dye lot (TDD section 11): opened/partial rolls first, then the
 *     roll that leaves the smallest unusable remainder, oldest first on ties.
 *     When no single roll of the preferred tier covers what is left, that
 *     tier's largest roll is used up first so fragments disappear.
 */

export type AllocationCandidate = {
  balance_id: string;
  lot_id: string | null;
  roll_id: string | null;
  location_id: string;
  /** "" when the material has no dye lot. */
  dye_lot_no: string;
  available: number;
  /** Initial roll quantity; used to detect opened/partial rolls. */
  initial: number | null;
  /** Physical quantity on hand (a fully reserved unopened roll is NOT partial). */
  on_hand: number;
  received_at: number;
};

export type AllocationPolicyInput = {
  policy: "FIFO" | "SAME_DYE_LOT_FIFO";
  track_dye_lot: boolean;
  max_dye_lots: number;
  /**
   * Roll-fragment reduction (FR-INV-006). Default on. When off, rolls are
   * consumed in plain FIFO order and a roll may be left with a small remainder.
   */
  reduce_fragments?: boolean;
};

export type AllocationLine = {
  balance_id: string;
  lot_id: string | null;
  roll_id: string | null;
  location_id: string;
  qty: number;
};

export type AllocationPlan = {
  lines: AllocationLine[];
  dye_lots: string[];
  requires_planner_approval: boolean;
  /** Units missing; > 0 means the requirement cannot be satisfied. */
  shortage: number;
};

const isPartial = (c: AllocationCandidate): boolean =>
  c.initial !== null && c.on_hand < c.initial;

const fifoOrder = (a: AllocationCandidate, b: AllocationCandidate): number => {
  const partialDiff = Number(isPartial(b)) - Number(isPartial(a));
  if (partialDiff !== 0) {
    return partialDiff;
  }
  if (a.received_at !== b.received_at) {
    return a.received_at - b.received_at;
  }
  return a.balance_id.localeCompare(b.balance_id);
};

const plainFifoOrder = (
  a: AllocationCandidate,
  b: AllocationCandidate
): number =>
  a.received_at - b.received_at || a.balance_id.localeCompare(b.balance_id);

/** FIFO without fragment reduction: oldest roll first, whatever its size. */
const takeFifo = (
  group: AllocationCandidate[],
  required: number
): AllocationLine[] => {
  const lines: AllocationLine[] = [];
  let remaining = required;
  for (const chosen of [...group].sort(plainFifoOrder)) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(chosen.available, remaining);
    lines.push({
      balance_id: chosen.balance_id,
      lot_id: chosen.lot_id,
      roll_id: chosen.roll_id,
      location_id: chosen.location_id,
      qty: take,
    });
    remaining -= take;
  }
  return lines;
};

const takeFromGroup = (
  group: AllocationCandidate[],
  required: number,
  reduceFragments = true
): AllocationLine[] => {
  if (!reduceFragments) {
    return takeFifo(group, required);
  }
  const pool = [...group].sort(fifoOrder);
  const lines: AllocationLine[] = [];
  let remaining = required;

  while (remaining > 0 && pool.length > 0) {
    // Opened rolls are used before untouched ones.
    const partials = pool.filter(isPartial);
    const tier = partials.length > 0 ? partials : pool;
    const fits = tier
      .filter((c) => c.available >= remaining)
      .sort((a, b) => a.available - b.available || fifoOrder(a, b));
    const chosen =
      fits[0] ??
      [...tier].sort((a, b) => b.available - a.available || fifoOrder(a, b))[0];
    const take = Math.min(chosen.available, remaining);
    lines.push({
      balance_id: chosen.balance_id,
      lot_id: chosen.lot_id,
      roll_id: chosen.roll_id,
      location_id: chosen.location_id,
      qty: take,
    });
    remaining -= take;
    pool.splice(pool.indexOf(chosen), 1);
  }
  return lines;
};

const groupByDyeLot = (
  candidates: AllocationCandidate[]
): Map<string, AllocationCandidate[]> => {
  const groups = new Map<string, AllocationCandidate[]>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.dye_lot_no) ?? [];
    list.push(candidate);
    groups.set(candidate.dye_lot_no, list);
  }
  return groups;
};

const total = (list: AllocationCandidate[]): number =>
  list.reduce((sum, c) => sum + c.available, 0);

const oldest = (list: AllocationCandidate[]): number =>
  Math.min(...list.map((c) => c.received_at));

export const planAllocation = (
  candidatesInput: AllocationCandidate[],
  required: number,
  policy: AllocationPolicyInput
): AllocationPlan => {
  const candidates = candidatesInput.filter((c) => c.available > 0);
  const grandTotal = total(candidates);

  if (required <= 0) {
    return {
      lines: [],
      dye_lots: [],
      requires_planner_approval: false,
      shortage: 0,
    };
  }
  if (grandTotal < required) {
    return {
      lines: [],
      dye_lots: [],
      requires_planner_approval: false,
      shortage: required - grandTotal,
    };
  }

  const reduce = policy.reduce_fragments ?? true;
  const ignoreDyeLot = !policy.track_dye_lot || policy.policy === "FIFO";
  if (ignoreDyeLot) {
    return {
      lines: takeFromGroup(candidates, required, reduce),
      dye_lots: [],
      requires_planner_approval: false,
      shortage: 0,
    };
  }

  const groups = [...groupByDyeLot(candidates).entries()].map(
    ([dyeLot, list]) => ({
      dyeLot,
      list,
      total: total(list),
      oldest: oldest(list),
    })
  );

  const single = groups
    .filter((g) => g.total >= required)
    .sort((a, b) => a.oldest - b.oldest || a.dyeLot.localeCompare(b.dyeLot))[0];
  if (single) {
    return {
      lines: takeFromGroup(single.list, required, reduce),
      dye_lots: [single.dyeLot],
      requires_planner_approval: false,
      shortage: 0,
    };
  }

  // No single dye lot suffices: minimise the number of dye lots used.
  const ordered = groups.sort(
    (a, b) =>
      b.total - a.total ||
      a.oldest - b.oldest ||
      a.dyeLot.localeCompare(b.dyeLot)
  );
  const lines: AllocationLine[] = [];
  const dyeLots: string[] = [];
  let remaining = required;
  for (const group of ordered) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(group.total, remaining);
    lines.push(...takeFromGroup(group.list, take, reduce));
    dyeLots.push(group.dyeLot);
    remaining -= take;
  }

  return {
    lines,
    dye_lots: dyeLots,
    requires_planner_approval:
      dyeLots.length > Math.max(1, policy.max_dye_lots),
    shortage: 0,
  };
};
