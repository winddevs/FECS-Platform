import type { Metadata } from "next";

import type { Media, Page, Post, Config } from "../payload-types";
import { getServerSideURL } from "./getURL";
import { mergeOpenGraph } from "./mergeOpenGraph";

const getImageURL = (image?: Media | Config["db"]["defaultIDType"] | null) => {
  const serverUrl = getServerSideURL();

  let url = serverUrl + "/website-template-OG.webp";

  if (image && typeof image === "object" && "url" in image) {
    const ogUrl = image.sizes?.og?.url;

    const chosen = ogUrl ?? image.url ?? "";
    // Media URLs are absolute (MinIO / CDN); only a relative path needs the site origin.
    url = chosen.startsWith("/") ? serverUrl + chosen : chosen || url;
  }

  return url;
};

export const generateMeta = async (args: {
  doc: Partial<Page> | Partial<Post> | null;
}): Promise<Metadata> => {
  const { doc } = args;

  const ogImage = getImageURL(doc?.meta?.image);

  const title = doc?.meta?.title
    ? doc?.meta?.title + " | bibaestudios"
    : "bibaestudios";

  return {
    description: doc?.meta?.description,
    openGraph: mergeOpenGraph({
      description: doc?.meta?.description || "",
      images: ogImage
        ? [
            {
              url: ogImage,
            },
          ]
        : undefined,
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join("/") : "/",
    }),
    title,
  };
};
