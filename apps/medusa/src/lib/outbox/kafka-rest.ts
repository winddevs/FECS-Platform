import { observeProviderCall } from "../observability/provider-calls";
import type { OutboxBatchPublishFn } from "./outbox";

type KafkaRestConfig = {
  /** Base URL of a Kafka REST proxy (Confluent REST Proxy, Redpanda HTTP Proxy, Strimzi bridge). */
  baseUrl: string;
  /** Prefix for topic names, e.g. "prod." */
  topicPrefix: string;
  authorization: string | null;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const CONTENT_TYPE = "application/vnd.kafka.json.v2+json";

export const kafkaRestConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): KafkaRestConfig | null => {
  if (!env.KAFKA_REST_URL) {
    return null;
  }
  const user = env.KAFKA_REST_USER;
  const password = env.KAFKA_REST_PASSWORD;
  return {
    baseUrl: env.KAFKA_REST_URL.replace(/\/$/, ""),
    topicPrefix: env.KAFKA_TOPIC_PREFIX ?? "",
    authorization:
      user && password
        ? `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
        : null,
    timeoutMs: Number(env.KAFKA_REST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
};

/**
 * Publishes a batch of events (all for one topic) to Kafka through a REST
 * proxy in a single request. The partition key is the aggregate id, so the
 * events of one aggregate stay in order inside their partition, and the
 * envelope's `event_id` lets every consumer deduplicate (the relay is
 * at-least-once). Kafka is an integration backbone and never the source of
 * truth: the database already holds the events.
 */
export const createKafkaRestBatchPublisher =
  (config: KafkaRestConfig): OutboxBatchPublishFn =>
  (rows) =>
    observeProviderCall("kafka", "POST /topics", async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetch(
          `${config.baseUrl}/topics/${encodeURIComponent(`${config.topicPrefix}${rows[0].topic}`)}`,
          {
            method: "POST",
            headers: {
              "content-type": CONTENT_TYPE,
              accept: "application/vnd.kafka.v2+json",
              ...(config.authorization
                ? { authorization: config.authorization }
                : {}),
            },
            body: JSON.stringify({
              records: rows.map((row) => ({
                key: row.partition_key,
                value: row.payload,
              })),
            }),
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error(`Kafka REST proxy responded ${response.status}`);
        }
        // The proxy answers 200 even when single records are rejected.
        const body = (await response.json().catch(() => ({}))) as {
          offsets?: Array<{
            error_code?: number | null;
            error?: string | null;
          }>;
        };
        const failed = body.offsets?.find((offset) => offset.error_code);
        if (failed) {
          throw new Error(
            `Kafka rejected a record: ${failed.error ?? failed.error_code}`
          );
        }
      } finally {
        clearTimeout(timer);
      }
    });
