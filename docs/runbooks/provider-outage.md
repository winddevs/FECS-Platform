# Runbook: carrier (J&T) or Meta outage

**Alerts:** `ShipmentsNotCreated`, `ShipmentsRejectedByCarrier`, `TrackingStale`,
`InboxDeadLetters`.
**Principle:** an outage must never stop checkout, orders, or production
(NFR-AVL-001/002). Provider calls are retried from durable state.

## J&T create failures

- States on `carrier_shipment.create_state`: `FAILED_RETRYABLE` (nothing was
  created, retried every minute), `UNKNOWN` (timeout - may exist at the carrier),
  `FAILED_FINAL` (rejected: bad address/credentials - needs a human).
- `UNKNOWN` is resolved by looking the parcel up by merchant reference
  (`F-<fulfillment id>`) **before** any retry, so no duplicate is created.
  Never delete the row or create the parcel by hand without checking the
  carrier portal for that reference.
- Long outage: leave it. The `retry-carrier-shipments` job drains the queue when
  the carrier is back. To pause automation set `JT_AUTO_CREATE_SHIPMENT=false`.
- `FAILED_FINAL`: fix the order address in Medusa, then
  `POST /admin/fulfillment/shipments {order_id, fulfillment_id}` (needs a new
  fulfillment if the carrier rejected permanently).

## Tracking gaps

- Check webhook health: `inbox_event` rows with provider `jt`. Signature
  failures show as 401s in the webhook pod logs - verify `JT_WEBHOOK_SECRET`.
- Turn on `JT_RECONCILIATION_ENABLED=true`: polling repairs missed pushes.

## Meta outage / token problems

- Inbound replies and notifications retry; failures are recorded in
  `conversation_message` / `notification_log`. Orders and shipments are
  unaffected. Expired page token -> rotate `META_PAGES`/`META_PAGE_ACCESS_TOKEN`
  and restart workers.
- `INBOX DLQ`: inspect `inbox_event.last_error`; after fixing the cause set
  `status='RETRY', next_retry_at=now()`.
