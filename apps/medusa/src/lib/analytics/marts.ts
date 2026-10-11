/**
 * Analytics marts (requirement section 27). Plain read-only views in their
 * own schema: analytics tools read them (or the Kafka event feed) and cannot
 * write transactional state.
 */
export const MART_DEFINITIONS: Array<[string, string]> = [
  [
    "material_consumption_daily",
    `SELECT date_trunc('day', occurred_at)::date AS day, material_id,
            COALESCE(SUM(qty) FILTER (WHERE movement_type = 'ISSUE_TO_PRODUCTION'), 0) AS issued,
            COALESCE(SUM(qty) FILTER (WHERE movement_type = 'RETURN_FROM_PRODUCTION'), 0) AS returned,
            COALESCE(SUM(qty) FILTER (WHERE movement_type = 'SCRAP'), 0) AS scrapped,
            COALESCE(SUM(qty) FILTER (WHERE movement_type = 'ISSUE_TO_PRODUCTION'), 0)
              - COALESCE(SUM(qty) FILTER (WHERE movement_type = 'RETURN_FROM_PRODUCTION'), 0) AS net_consumed
     FROM public.material_stock_movement WHERE deleted_at IS NULL
     GROUP BY 1, 2`,
  ],
  [
    "fabric_variance",
    `SELECT mo_id, batch_id, fabric_material_id, planned_consumption, actual_consumption,
            actual_consumption - planned_consumption AS variance,
            CASE WHEN planned_consumption > 0
                 THEN round(((actual_consumption - planned_consumption) / planned_consumption * 100)::numeric, 2) END AS variance_pct,
            updated_at AS cut_at
     FROM public.cut_plan WHERE status = 'CUT' AND deleted_at IS NULL`,
  ],
  [
    "production_output_daily",
    `SELECT date_trunc('day', created_at)::date AS day, sku, SUM(qty) AS packed_qty
     FROM public.packing_record WHERE deleted_at IS NULL GROUP BY 1, 2`,
  ],
  [
    "first_pass_yield_daily",
    `SELECT date_trunc('day', created_at)::date AS day,
            SUM(qty_inspected) AS inspected, SUM(pass_qty) AS passed,
            CASE WHEN SUM(qty_inspected) > 0
                 THEN round((SUM(pass_qty) / SUM(qty_inspected) * 100)::numeric, 2) END AS first_pass_yield_pct
     FROM public.quality_inspection WHERE target_type = 'BUNDLE' AND deleted_at IS NULL GROUP BY 1`,
  ],
  [
    "rework_reject_daily",
    `SELECT date_trunc('day', occurred_at)::date AS day, work_center_id, op_code,
            SUM(input_qty) AS input_qty, SUM(good_qty) AS good_qty,
            SUM(rework_qty) AS rework_qty, SUM(reject_qty) AS reject_qty,
            CASE WHEN SUM(input_qty) > 0 THEN round((SUM(rework_qty)::numeric / SUM(input_qty) * 100), 2) END AS rework_pct,
            CASE WHEN SUM(input_qty) > 0 THEN round((SUM(reject_qty)::numeric / SUM(input_qty) * 100), 2) END AS reject_pct
     FROM public.operation_execution WHERE deleted_at IS NULL GROUP BY 1, 2, 3`,
  ],
  [
    "work_center_utilization_daily",
    `SELECT date_trunc('day', e.occurred_at)::date AS day, w.id AS work_center_id, w.code, w.type,
            SUM(e.standard_minutes_total) AS load_minutes,
            w.capacity_minutes_per_day * w.efficiency_pct / 100.0 AS effective_capacity_minutes,
            CASE WHEN w.capacity_minutes_per_day * w.efficiency_pct > 0
                 THEN round((SUM(e.standard_minutes_total) / (w.capacity_minutes_per_day * w.efficiency_pct / 100.0) * 100)::numeric, 1) END AS utilization_pct
     FROM public.operation_execution e
     JOIN public.work_center w ON w.id = e.work_center_id AND w.deleted_at IS NULL
     WHERE e.deleted_at IS NULL GROUP BY 1, w.id, w.code, w.type, w.capacity_minutes_per_day, w.efficiency_pct`,
  ],
  [
    "material_inventory_aging",
    `SELECT b.material_id,
            CASE WHEN now() - l.received_at < interval '30 days' THEN '0-30'
                 WHEN now() - l.received_at < interval '90 days' THEN '31-90'
                 WHEN now() - l.received_at < interval '180 days' THEN '91-180'
                 ELSE '180+' END AS age_bucket,
            SUM(b.on_hand_qty) AS on_hand
     FROM public.material_balance b
     JOIN public.material_lot l ON l.id = b.lot_id AND l.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND b.on_hand_qty > 0 GROUP BY 1, 2`,
  ],
  [
    "fg_inventory_aging",
    `SELECT sku,
            CASE WHEN now() - produced_at < interval '30 days' THEN '0-30'
                 WHEN now() - produced_at < interval '90 days' THEN '31-90'
                 WHEN now() - produced_at < interval '180 days' THEN '91-180'
                 ELSE '180+' END AS age_bucket,
            SUM(remaining_qty) AS pieces
     FROM public.fg_batch WHERE deleted_at IS NULL AND remaining_qty > 0 GROUP BY 1, 2`,
  ],
  [
    "sell_through_weekly",
    `SELECT date_trunc('week', occurred_at)::date AS week, sku,
            SUM(qty) FILTER (WHERE movement_type = 'RECEIPT') AS received,
            SUM(qty) FILTER (WHERE movement_type = 'SHIP' AND reference_type = 'FULFILLMENT') AS sold,
            CASE WHEN COALESCE(SUM(qty) FILTER (WHERE movement_type = 'RECEIPT'), 0) > 0
                 THEN round((COALESCE(SUM(qty) FILTER (WHERE movement_type = 'SHIP' AND reference_type = 'FULFILLMENT'), 0)::numeric
                             / SUM(qty) FILTER (WHERE movement_type = 'RECEIPT') * 100), 1) END AS sell_through_pct
     FROM public.fg_movement WHERE deleted_at IS NULL GROUP BY 1, 2`,
  ],
  [
    "order_conversion_daily",
    `SELECT date_trunc('day', created_at)::date AS day, count(*) AS carts_created,
            count(completed_at) AS orders_placed,
            round((count(completed_at)::numeric / NULLIF(count(*), 0) * 100), 1) AS conversion_pct
     FROM public.cart WHERE deleted_at IS NULL GROUP BY 1`,
  ],
  [
    "fulfillment_lead_time",
    `SELECT s.order_id, o.created_at AS ordered_at, s.created_at AS shipment_created_at,
            s.delivered_at,
            round((EXTRACT(EPOCH FROM s.created_at - o.created_at) / 3600)::numeric, 1) AS hours_to_ship,
            round((EXTRACT(EPOCH FROM s.delivered_at - o.created_at) / 3600)::numeric, 1) AS hours_to_deliver
     FROM public.carrier_shipment s
     JOIN public."order" o ON o.id = s.order_id AND o.deleted_at IS NULL
     WHERE s.deleted_at IS NULL AND s.return_id IS NULL AND s.exchange_return_id IS NULL AND s.superseded_at IS NULL`,
  ],
  [
    "carrier_performance",
    `SELECT carrier_code, count(*) AS shipments,
            count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
            count(*) FILTER (WHERE status IN ('DELIVERY_FAILED', 'RETURNING', 'RETURNED')) AS problem_parcels,
            count(*) FILTER (WHERE create_state IN ('FAILED_FINAL', 'FAILED_RETRYABLE', 'UNKNOWN')) AS creation_problems,
            round((count(*) FILTER (WHERE status = 'DELIVERED')::numeric / NULLIF(count(*), 0) * 100), 1) AS delivered_pct,
            round(avg(EXTRACT(EPOCH FROM delivered_at - created_at) / 3600)::numeric, 1) AS avg_hours_to_deliver
     FROM public.carrier_shipment
     WHERE deleted_at IS NULL AND return_id IS NULL AND superseded_at IS NULL GROUP BY 1`,
  ],
  [
    "return_reason",
    `SELECT r.reason, r.type, count(DISTINCT r.id) AS returns, COALESCE(SUM(i.qty), 0) AS pieces,
            COALESCE(SUM(r.refund_amount) FILTER (WHERE r.refund_status = 'COMPLETED'), 0) AS refunded
     FROM public.return_authorization r
     LEFT JOIN public.rma_item i ON i.return_id = r.id AND i.deleted_at IS NULL
     WHERE r.deleted_at IS NULL GROUP BY 1, 2`,
  ],
  [
    "sku_margin_inputs",
    `WITH price AS (
       SELECT material_id, SUM(unit_price * ordered_qty) / NULLIF(SUM(ordered_qty), 0) AS avg_unit_price
       FROM public.purchase_order_line WHERE deleted_at IS NULL AND unit_price > 0 GROUP BY material_id
     ), latest_bom AS (
       SELECT DISTINCT ON (product_sku) id, product_sku, version FROM public.bom
       WHERE status = 'RELEASED' AND deleted_at IS NULL ORDER BY product_sku, version DESC
     ), latest_routing AS (
       SELECT DISTINCT ON (product_sku) id, product_sku, version FROM public.routing
       WHERE status = 'RELEASED' AND deleted_at IS NULL ORDER BY product_sku, version DESC
     )
     SELECT b.product_sku, b.version AS bom_version,
            SUM(bl.qty_per_unit * (1 + bl.waste_factor) * COALESCE(p.avg_unit_price, 0)) AS material_cost_per_unit,
            BOOL_OR(p.avg_unit_price IS NULL) AS has_unpriced_material,
            (SELECT SUM(o.standard_minutes) FROM public.routing_operation o
              JOIN latest_routing r ON r.id = o.routing_id
              WHERE r.product_sku = b.product_sku AND o.deleted_at IS NULL) AS standard_minutes_per_unit
     FROM latest_bom b
     JOIN public.bom_line bl ON bl.bom_id = b.id AND bl.deleted_at IS NULL
     LEFT JOIN price p ON p.material_id = bl.material_id
     GROUP BY b.product_sku, b.version`,
  ],
];

/** Names of the marts, for the read API and its tests. */
export const ANALYTICS_MARTS = MART_DEFINITIONS.map(([name]) => name);
