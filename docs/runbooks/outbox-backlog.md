# Runbook: outbox backlog / events not flowing

**Alerts:** `OutboxLagHigh`, `OutboxPublishRetriesStuck`, `OutboxEventsFailed`.
**Impact:** domain state is correct and durable; downstream reactions (Medusa
stock sync, notifications) are delayed. Nothing is lost.

1. `GET /admin/ops/summary` -> `outbox`: which table, how old.
2. Are workers running? `kubectl get deploy medusa-worker`. The `publish-outbox`
   job runs every 2s on each worker.
3. Redis down? The event bus needs Redis; check `REDIS_URL` health. Events stay
   in the outbox and drain when it returns.
4. Publishing never gives up: a row whose publish fails stays `PENDING` and
   retries with a backoff capped at 5 minutes, so an event bus outage of any
   length loses nothing. `OutboxPublishRetriesStuck` fires when rows have failed
   10+ times; read `last_error` on the row (usually the bus or a bad subscriber).
   Events of one aggregate are published in order, so one stuck row also holds
   back later events of the same aggregate (that is intended).
   `FAILED` is only used when an operator parks a poison event by hand; to
   release those: `UPDATE <table> SET status='PENDING', attempts=0, available_at=now() WHERE status='FAILED';`
5. Scale workers (`kubectl scale deploy medusa-worker --replicas=N`); claiming
   uses `SKIP LOCKED`, so extra replicas just add throughput.

Consumers dedupe by `event_id` and drop stale versions, so re-delivery is safe.

## Kafka relay (`kafka_relay_event`)

The Kafka feed has its own queue and job (`publish-kafka-relay`, every 2s). A
Kafka or REST-proxy outage only grows `kafka_relay_event`; business flows do not
wait for it, and the queue drains when Kafka returns (at-least-once; consumers
dedupe by `event_id`). Check `last_error` on the oldest `PENDING` row: a
missing topic ("unknown topic") means the topics were not provisioned, and a
timeout means the proxy or broker is down. Alert on provider `kafka` call
failures in `fashion_provider_call_duration_ms`.
