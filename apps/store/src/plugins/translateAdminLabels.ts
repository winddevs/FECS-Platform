import { formatLabels, toWords } from "payload";
import type { Block, Config, Field, Plugin, Tab } from "payload";

import { adminLabelsVi } from "@/i18n/admin-labels";

/**
 * Adds a Vietnamese translation to every admin label that has an entry in
 * `adminLabelsVi`. It must be the last plugin in the list, so it also reaches
 * the collections that other plugins add (forms, redirects, search).
 *
 * It edits the config objects in place. That is safe because a label that is
 * already `{ en, vi }` is never touched again, so running twice (for example
 * after a hot reload) gives the same result.
 */

type LabelObject = Record<string, string>;

interface LabelPair {
  plural: unknown;
  singular: unknown;
}

/** The parts of collections, globals, fields, tabs and blocks that hold text. */
interface Localizable {
  admin?: {
    description?: unknown;
    group?: unknown;
    placeholder?: unknown;
  };
  blocks?: (Block | string)[];
  description?: unknown;
  fields?: Field[];
  label?: unknown;
  labels?: LabelPair;
  name?: string;
  options?: unknown[];
  slug?: string;
  tabs?: Tab[];
  type?: string;
}

const translations = new Map(Object.entries(adminLabelsVi));

const toBilingual = (english: string): LabelObject | undefined => {
  const vietnamese = translations.get(english);
  return vietnamese ? { en: english, vi: vietnamese } : undefined;
};

/** Translates a plain string. Anything else (functions, objects) is kept. */
const localizeText = (value: unknown): unknown =>
  typeof value === "string" ? (toBilingual(value) ?? value) : value;

/**
 * Payload shows `toWords(name)` when a field has no label, so the lookup
 * uses that text. `label: false` means "hide the label" and stays as is.
 */
const localizeLabel = (current: unknown, name: string | undefined): unknown => {
  if (current === undefined) {
    return name ? (toBilingual(toWords(name)) ?? current) : current;
  }
  return localizeText(current);
};

/** Payload builds default singular and plural labels from the slug or name. */
const localizePair = (
  current: LabelPair | undefined,
  source: string | undefined
): LabelPair | undefined => {
  const base = current ?? (source ? formatLabels(source) : undefined);
  if (!base) {
    return undefined;
  }
  const singular = localizeText(base.singular);
  const plural = localizeText(base.plural);
  if (singular === base.singular && plural === base.plural) {
    return undefined;
  }
  return { plural, singular };
};

const localizeOption = (option: unknown): unknown => {
  if (typeof option === "string") {
    const label = toBilingual(option);
    return label ? { label, value: option } : option;
  }
  if (
    typeof option === "object" &&
    option !== null &&
    "label" in option &&
    typeof option.label === "string"
  ) {
    const label = toBilingual(option.label);
    return label ? { ...option, label } : option;
  }
  return option;
};

const localizeAdminProps = (node: Localizable): void => {
  const { admin } = node;
  if (!admin) {
    return;
  }
  admin.description = localizeText(admin.description);
  admin.group = localizeText(admin.group);
  admin.placeholder = localizeText(admin.placeholder);
};

const localizeFields = (fields: Field[] | undefined): void => {
  for (const field of fields ?? []) {
    localizeField(field as Localizable);
  }
};

const localizeBlock = (block: Block): void => {
  const node = block as Localizable;
  const labels = localizePair(node.labels, node.slug);
  if (labels) {
    node.labels = labels;
  }
  localizeFields(node.fields);
};

const localizeTab = (tab: Tab): void => {
  const node = tab as Localizable;
  const label = localizeLabel(node.label, node.name);
  if (label !== node.label) {
    node.label = label;
  }
  node.description = localizeText(node.description);
  localizeFields(node.fields);
};

const localizeField = (node: Localizable): void => {
  const label = localizeLabel(node.label, node.name);
  if (label !== node.label) {
    node.label = label;
  }
  localizeAdminProps(node);

  if (node.type === "array" || node.type === "blocks") {
    const labels = localizePair(node.labels, node.name);
    if (labels) {
      node.labels = labels;
    }
  }
  if (node.options) {
    node.options = node.options.map(localizeOption);
  }
  localizeFields(node.fields);
  for (const tab of node.tabs ?? []) {
    localizeTab(tab);
  }
  for (const block of node.blocks ?? []) {
    // A string is a reference to a block in the top-level `blocks` list.
    if (typeof block !== "string") {
      localizeBlock(block);
    }
  }
};

export const translateAdminLabels: Plugin = (config: Config): Config => {
  for (const collection of config.collections ?? []) {
    const node = collection as Localizable;
    const labels = localizePair(node.labels, node.slug);
    if (labels) {
      node.labels = labels;
    }
    localizeAdminProps(node);
    localizeFields(node.fields);
  }

  for (const global of config.globals ?? []) {
    const node = global as Localizable;
    const label = localizeLabel(node.label, node.slug);
    if (label !== node.label) {
      node.label = label;
    }
    localizeAdminProps(node);
    localizeFields(node.fields);
  }

  for (const block of config.blocks ?? []) {
    localizeBlock(block);
  }

  return config;
};
