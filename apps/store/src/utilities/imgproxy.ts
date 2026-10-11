/**
 * imgproxy URLs for images stored in MinIO.
 *
 *   Browser -> Cloudflare (img.bibaestudios.com) -> imgproxy -> MinIO
 *
 * imgproxy runs in "presets only" mode: it accepts a fixed list of widths
 * (docker/imgproxy/presets.txt) and nothing else, so URLs need no secret and
 * can be built in the browser.
 *
 * URL shape:  {IMGPROXY_URL}/{version}/w{width}/{base64url(key)}.webp
 *   - version: changes when the file is replaced, so CDNs fetch the new copy
 *   - width:   one of IMGPROXY_WIDTHS (the same list as the presets file)
 *   - key:     object key in the bucket, e.g. cms/media/photo.png
 *   - .webp:   Cloudflare caches this extension by default
 */

/** Keep in sync with docker/imgproxy/presets.txt. */
export const IMGPROXY_WIDTHS = [
  32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

/** Every Payload media file lives under this prefix in the bucket. */
const MEDIA_KEY_PREFIX = "cms/media/";

/** Formats imgproxy can read that are worth converting. SVG and GIF stay as they are. */
const CONVERTIBLE = /\.(png|jpe?g|webp|avif|heic|heif|tiff?|bmp)$/i;

const VERSION_UNSAFE = /[^\w-]/g;

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

/** Smallest preset that is at least as wide as asked (never upscales a request). */
export const pickWidth = (width: number): number => {
  for (const candidate of IMGPROXY_WIDTHS) {
    if (candidate >= width) {
      return candidate;
    }
  }
  return IMGPROXY_WIDTHS.at(-1) ?? 3840;
};

const getBaseURL = (): string | null => {
  const base = process.env.NEXT_PUBLIC_IMGPROXY_URL;
  return base ? base.replace(/\/+$/, "") : null;
};

/** True when imgproxy is configured for this build. */
export const isImgproxyEnabled = (): boolean => getBaseURL() !== null;

/**
 * Reads the object key and version out of a Payload media URL.
 * Returns null for anything that is not a file in the media prefix
 * (Medusa product photos, /public files, external sites).
 */
export const parseMediaURL = (
  src: string
): { key: string; version: string } | null => {
  let url: URL;
  try {
    url = new URL(src, "http://local.invalid");
  } catch {
    return null;
  }

  const marker = `/${MEDIA_KEY_PREFIX}`;
  const at = url.pathname.indexOf(marker);
  if (at === -1) {
    return null;
  }

  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice(at + 1));
  } catch {
    return null;
  }

  const hasTraversal = key
    .split("/")
    .some((part) => part === ".." || part === ".");
  if (
    hasTraversal ||
    !key.startsWith(MEDIA_KEY_PREFIX) ||
    !CONVERTIBLE.test(key)
  ) {
    return null;
  }

  const version = (url.searchParams.get("v") ?? "0").replace(
    VERSION_UNSAFE,
    ""
  );
  return { key, version: version || "0" };
};

/** Builds the imgproxy URL, or null when this source should not go through imgproxy. */
export const buildImgproxyURL = (src: string, width: number): string | null => {
  const base = getBaseURL();
  if (!base) {
    return null;
  }
  const media = parseMediaURL(src);
  if (!media) {
    return null;
  }
  return `${base}/${media.version}/w${pickWidth(width)}/${toBase64Url(media.key)}.webp`;
};
