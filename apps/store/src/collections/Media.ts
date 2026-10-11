import type { CollectionAfterReadHook, CollectionConfig } from "payload";

const VERSION_RADIX = 36;

const withVersion = (url: unknown, version: string): unknown => {
  if (typeof url !== "string" || url === "" || url.includes("?v=")) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
};

/**
 * Adds ?v=<last change> to every file URL.
 *
 * Payload overwrites the same file name when an image is re-saved (focal point,
 * crop). CDNs keep images for a year, so a changing version in the URL is what
 * makes them fetch the new copy.
 */
const addFileVersion: CollectionAfterReadHook = ({ doc }) => {
  const changedAt = Date.parse(String(doc?.updatedAt ?? ""));
  if (!doc || Number.isNaN(changedAt)) {
    return doc;
  }
  const version = changedAt.toString(VERSION_RADIX);

  doc.url = withVersion(doc.url, version);
  doc.thumbnailURL = withVersion(doc.thumbnailURL, version);
  for (const size of Object.values(doc.sizes ?? {}) as { url?: unknown }[]) {
    if (size && typeof size === "object") {
      size.url = withVersion(size.url, version);
    }
  }
  return doc;
};

export const Media: CollectionConfig = {
  slug: "media",
  hooks: {
    afterRead: [addFileVersion],
  },
  upload: {
    disableLocalStorage: true,
    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 300,
        position: "centre",
      },
      {
        name: "card",
        width: 768,
        height: 1024,
        position: "centre",
      },
      {
        name: "tablet",
        width: 1024,
        position: "centre",
      },
    ],
    // Videos have no generated sizes, so fall back to no thumbnail for them.
    adminThumbnail: ({ doc }) => {
      const sizes = doc.sizes as
        | { thumbnail?: { url?: string | null } }
        | undefined;
      return sizes?.thumbnail?.url ?? null;
    },
    mimeTypes: ["image/*", "video/*"],
    pasteURL: {
      allowList: [
        { protocol: "http", hostname: "localhost" },
        {
          protocol: "https",
          hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
        },
        {
          protocol: "https",
          hostname: "medusa-server-testing.s3.amazonaws.com",
        },
        {
          protocol: "https",
          hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
        },
      ],
    },
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Alt Text",
    },
  ],
};
