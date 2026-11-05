"use client";

import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const AUTOPLAY_INTERVAL_MS = 6500;
const SWIPE_THRESHOLD_PX = 50;

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string | null;
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
};

const Hero = ({ slides }: { slides: HeroSlide[] }) => {
  const t = useTranslations("home.hero");
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const regionRef = useRef<HTMLElement>(null);

  const count = slides.length;
  const paused = userPaused || hoverPaused || tabHidden || reducedMotion;

  const goTo = useCallback(
    (index: number) => {
      setActive(((index % count) + count) % count);
      setCycle((value) => value + 1);
    },
    [count]
  );

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (count < 2 || paused) {
      return;
    }
    const timer = setTimeout(() => goTo(active + 1), AUTOPLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [active, cycle, count, paused, goTo]);

  // Native listeners: the carousel region itself is not an interactive
  // element, so hover/focus/swipe are wired outside JSX.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) {
      return;
    }

    const pause = () => setHoverPaused(true);
    const resume = () => setHoverPaused(false);
    const onTouchStart = (event: globalThis.TouchEvent) => {
      touchStartX.current = event.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = (event: globalThis.TouchEvent) => {
      const start = touchStartX.current;
      touchStartX.current = null;
      const end = event.changedTouches[0]?.clientX;
      if (start === null || end === undefined) {
        return;
      }
      const delta = end - start;
      if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
        goTo(delta < 0 ? active + 1 : active - 1);
      }
    };

    region.addEventListener("mouseenter", pause);
    region.addEventListener("mouseleave", resume);
    region.addEventListener("focusin", pause);
    region.addEventListener("focusout", resume);
    region.addEventListener("touchstart", onTouchStart, { passive: true });
    region.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      region.removeEventListener("mouseenter", pause);
      region.removeEventListener("mouseleave", resume);
      region.removeEventListener("focusin", pause);
      region.removeEventListener("focusout", resume);
      region.removeEventListener("touchstart", onTouchStart);
      region.removeEventListener("touchend", onTouchEnd);
    };
  }, [active, goTo]);

  return (
    <section
      ref={regionRef}
      className={`sf-hero${paused ? " is-paused" : ""}`}
      style={
        { "--sf-hero-interval": `${AUTOPLAY_INTERVAL_MS}ms` } as CSSProperties
      }
      aria-roledescription="carousel"
      aria-label={t("label")}
    >
      {slides.map((slide, index) => {
        const isActive = index === active;
        const HeadingTag = index === 0 ? "h1" : "h2";
        return (
          <div
            key={slide.id}
            className={[
              "sf-hero-slide",
              isActive ? "is-active" : "",
              slide.image ? "" : "no-image",
            ]
              .filter(Boolean)
              .join(" ")}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${count}`}
            aria-hidden={!isActive}
            inert={!isActive}
          >
            <div className="sf-hero-media">
              {slide.image && (
                <Image
                  src={slide.image}
                  alt=""
                  fill
                  sizes="100vw"
                  quality={75}
                  priority={index === 0}
                  draggable={false}
                />
              )}
            </div>
            <div className="sf-hero-shade" />
            <div className="sf-hero-copy">
              <p className="sf-hero-eyebrow">{slide.eyebrow}</p>
              <HeadingTag className="sf-hero-title">{slide.title}</HeadingTag>
              <p className="sf-hero-sub">{slide.subtitle}</p>
              <LocalizedClientLink
                href={slide.href}
                className="sf-btn sf-btn-light"
                data-testid={index === 0 ? "hero-cta" : undefined}
              >
                {slide.cta}
              </LocalizedClientLink>
            </div>
          </div>
        );
      })}

      {count > 1 && (
        <>
          <button
            type="button"
            className="sf-hero-arrow sf-hero-prev"
            aria-label={t("prev")}
            onClick={() => goTo(active - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sf-hero-arrow sf-hero-next"
            aria-label={t("next")}
            onClick={() => goTo(active + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <div className="sf-hero-dots">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={`sf-hero-dot${index === active ? " is-active" : ""}`}
                aria-label={t("goTo", { number: index + 1 })}
                aria-current={index === active}
                onClick={() => goTo(index)}
              >
                {/* Remounted on every cycle so the progress line restarts. */}
                {index === active && (
                  <span key={cycle} className="sf-hero-dot-fill" />
                )}
              </button>
            ))}
            <button
              type="button"
              className="sf-hero-pause"
              aria-label={userPaused ? t("play") : t("pause")}
              onClick={() => {
                setUserPaused((value) => !value);
                setCycle((value) => value + 1);
              }}
            >
              {userPaused ? (
                <Play className="size-3" aria-hidden="true" />
              ) : (
                <Pause className="size-3" aria-hidden="true" />
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default Hero;
