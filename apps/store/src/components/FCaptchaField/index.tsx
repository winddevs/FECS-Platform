"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { CAPTCHA_FIELD } from "@/lib/captcha/constants";

type FCaptchaRenderOptions = {
  siteKey: string;
  responseField: boolean;
  callback: (token: string) => void;
  expiredCallback: () => void;
  errorCallback: () => void;
};

type FCaptchaApi = {
  configure: (options: { serverUrl: string }) => void;
  render: (container: HTMLElement, options: FCaptchaRenderOptions) => string;
  reset: (widgetId: string) => void;
  destroy: (widgetId: string) => void;
};

declare global {
  interface Window {
    FCaptcha?: FCaptchaApi;
  }
}

// Both values are public and are inlined into the browser bundle at build time.
const CAPTCHA_ORIGIN = process.env.NEXT_PUBLIC_FCAPTCHA_ORIGIN ?? "";
const SITE_KEY = process.env.NEXT_PUBLIC_FCAPTCHA_SITE_KEY ?? "";

type Props = {
  /** Called with the token when the visitor passes, and with "" when it is lost. */
  onTokenChange?: (token: string) => void;
  /**
   * Change this value after every submit attempt. A token works once, so the
   * widget is reset and the visitor verifies again.
   */
  resetSignal?: unknown;
};

/**
 * FCaptcha checkbox. Renders a hidden `fcaptcha_token` input, so a plain
 * `<form action={serverAction}>` posts the token with the other fields.
 * Renders nothing when no site key is configured (local development).
 */
export const FCaptchaField = ({ onTokenChange, resetSignal }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isFirstResetSignal = useRef(true);
  const onTokenChangeRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const isEnabled = Boolean(SITE_KEY && CAPTCHA_ORIGIN);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const updateToken = useCallback((value: string) => {
    setToken(value);
    onTokenChangeRef.current?.(value);
  }, []);

  // The widget owns its DOM and listeners: mount and destroy it with this component.
  useEffect(() => {
    const api = window.FCaptcha;
    const container = containerRef.current;
    if (!(isEnabled && scriptReady && api && container)) {
      return;
    }

    api.configure({ serverUrl: CAPTCHA_ORIGIN });
    const widgetId = api.render(container, {
      callback: updateToken,
      errorCallback: () => updateToken(""),
      expiredCallback: () => updateToken(""),
      // The token lives in the hidden input below, which React keeps in sync.
      responseField: false,
      siteKey: SITE_KEY,
    });
    widgetIdRef.current = widgetId;

    return () => {
      api.destroy(widgetId);
      widgetIdRef.current = null;
    };
  }, [isEnabled, scriptReady, updateToken]);

  useEffect(() => {
    if (isFirstResetSignal.current) {
      isFirstResetSignal.current = false;
      return;
    }
    if (widgetIdRef.current) {
      window.FCaptcha?.reset(widgetIdRef.current);
    }
    updateToken("");
  }, [resetSignal, updateToken]);

  if (!isEnabled) {
    return null;
  }

  return (
    <div className="my-4">
      <div ref={containerRef} />
      <input name={CAPTCHA_FIELD} type="hidden" value={token} />
      <Script
        onReady={() => setScriptReady(true)}
        src={`${CAPTCHA_ORIGIN}/fcaptcha.js`}
        strategy="afterInteractive"
      />
    </div>
  );
};
