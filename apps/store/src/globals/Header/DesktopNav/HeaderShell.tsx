"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const SCROLLED_AFTER_PX = 8;
const HIDE_DELTA_PX = 6;
const SHOW_DELTA_PX = -4;

/**
 * Sticky header frame. It gains a frosted look once the page scrolls, slides
 * away while scrolling down and returns on scroll up. It stays put while
 * focus is inside it, so keyboard users never lose the menu.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const header = ref.current;
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;

      setScrolled(y > SCROLLED_AFTER_PX);

      const height = header?.offsetHeight ?? 0;
      const hasFocus = header?.matches(":focus-within") ?? false;

      if (y <= height * 2 || delta < SHOW_DELTA_PX || hasFocus) {
        setHidden(false);
      } else if (delta > HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  const className = [
    "sf-header",
    scrolled ? "is-scrolled" : "",
    hidden ? "is-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header ref={ref} className={className}>
      {children}
    </header>
  );
}
