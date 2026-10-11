import Script from "next/script";
import type { Thing, WithContext } from "schema-dts";

type JsonLdProps = {
  /** Stable, unique id per structured-data block on the page. */
  id?: string;
  code: WithContext<Thing>;
};

const LESS_THAN = /</g;

/**
 * Serializes JSON-LD for inline embedding. Escaping "<" prevents catalog text
 * such as "</script>" from closing the tag early (script injection).
 */
const serializeJsonLd = (code: WithContext<Thing>): string =>
  JSON.stringify(code).replace(LESS_THAN, "\\u003c");

export const JsonLd = ({ id = "json-ld", code }: JsonLdProps) => (
  <Script
    id={id}
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: serializeJsonLd(code) }}
  />
);

export * from "schema-dts";
