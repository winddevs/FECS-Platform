import { getServerSideURL } from "@/utilities/getURL";

export const SITE_NAME = "bibaestudios";

/** Absolute URL on the public site for a path such as `/vi/vn/store`. */
export const absoluteUrl = (path: string): string =>
  new URL(path, getServerSideURL()).href;
