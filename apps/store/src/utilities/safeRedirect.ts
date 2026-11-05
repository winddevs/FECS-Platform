/**
 * Returns `url` when it is safe to navigate to from the browser, else `null`.
 *
 * Allowed: a same-site path (`/thanks`) or an absolute http(s) URL on this
 * site's origin. Everything else (`javascript:`, `data:`, `//other.site`,
 * other origins) is dropped, so editor-supplied content cannot be turned into
 * a script-execution or phishing redirect.
 */
export const safeRedirectTarget = (
  url: string | null | undefined
): string | null => {
  if (!url) {
    return null;
  }
  const value = url.trim();

  if (value.startsWith("/")) {
    const isProtocolRelative = value.startsWith("//") || value.includes("\\");
    return isProtocolRelative ? null : value;
  }

  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    if (isHttp && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return null;
  }
  return null;
};
