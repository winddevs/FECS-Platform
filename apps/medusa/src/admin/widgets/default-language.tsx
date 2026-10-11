import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useEffect } from "react";

const MARKER = "fecs.language.initialised";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The shop works in Vietnamese. The first time a browser opens the admin, switch
 * the dashboard to Vietnamese once; after that the operator's own choice
 * (Profile > Language) is respected. Runs on the login page, which every new
 * browser passes through.
 */
const DefaultLanguage = () => {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MARKER)) {
        return;
      }
      window.localStorage.setItem(MARKER, "1");
      window.localStorage.setItem("lng", "vi");
      document.cookie = `lng=vi; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      // The dashboard already initialised in English: reload once to apply.
      window.location.reload();
    } catch {
      // Storage is unavailable (private mode): keep the dashboard default.
    }
  }, []);
  return null;
};

export const config = defineWidgetConfig({ zone: "login.before" });

export default DefaultLanguage;
