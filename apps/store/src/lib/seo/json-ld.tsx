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

/**
 * Renders a plain `<script type="application/ld+json">` so the markup is part
 * of the server HTML. `next/script` must not be used here: it injects the tag
 * on the client, which crawlers that do not run JavaScript never see.
 */
export const JsonLd = ({ id = "json-ld", code }: JsonLdProps) => (
  <script
    id={id}
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: serializeJsonLd(code) }}
  />
);

export * from "schema-dts";
