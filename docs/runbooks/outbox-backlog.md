# Runbook: outbox backlog / events not flowing

**Alerts:** `OutboxLagHigh`, `OutboxEventsFailed`.
**Impact:** domain state is correct and durable; downstream reactions (Medusa
stock sync, notifications) are delayed. Nothing is lost.

1. `GET /admin/ops/summary` -> `outbox`: which table, how old.
2. Are workers running? `kubectl get deploy medusa-worker`. The `publish-outbox`
   job runs every 2s on each worker.
3. Redis down? The event bus needs Redis; check `REDIS_URL` health. Events stay
   in the outbox and drain when it returns.
4. `FAILED` rows (10 attempts exhausted): read `last_error` on the row. Fix the
   cause (usually a bad subscriber), then reset:
   `UPDATE <table> SET status='PENDING', attempts=0, available_at=now() WHERE status='FAILED';`
5. Scale workers (`kubectl scale deploy medusa-worker --replicas=N`); claiming
   uses `SKIP LOCKED`, so extra replicas just add throughput.

Consumers dedupe by `event_id` and drop stale versions, so re-delivery is safe.
