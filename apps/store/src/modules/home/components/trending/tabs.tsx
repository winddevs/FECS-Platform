"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type TrendingTab = {
  id: string;
  label: string;
  content: ReactNode;
};

type TrendingTabsProps = {
  tabs: TrendingTab[];
  tabsLabel: string;
  scrollBackLabel: string;
  scrollForwardLabel: string;
};

const SCROLL_RATIO = 0.85;

/** Tabbed product carousel with a sliding underline. */
export function TrendingTabs({
  tabs,
  tabsLabel,
  scrollBackLabel,
  scrollForwardLabel,
}: TrendingTabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const [ink, setInk] = useState({ x: 0, width: 0 });
  const tablistRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const measureInk = useCallback(() => {
    const active = tablistRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    );
    if (active) {
      setInk({ x: active.offsetLeft, width: active.offsetWidth });
    }
  }, []);

  useLayoutEffect(() => {
    measureInk();
  }, [measureInk, activeId]);

  useEffect(() => {
    window.addEventListener("resize", measureInk);
    return () => window.removeEventListener("resize", measureInk);
  }, [measureInk]);

  const scrollRow = (direction: 1 | -1) => {
    const row = carouselRef.current?.querySelector<HTMLElement>(
      '[role="tabpanel"]:not([hidden])'
    );
    row?.scrollBy({
      left: direction * row.clientWidth * SCROLL_RATIO,
      behavior: "smooth",
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === activeTab?.id);
    let next = index;
    if (event.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[next];
    if (nextTab) {
      setActiveId(nextTab.id);
      tablistRef.current
        ?.querySelector<HTMLElement>(`[data-tab-id="${nextTab.id}"]`)
        ?.focus();
    }
  };

  return (
    <>
      <div className="sf-section-head !mb-8">
        {tabs.length > 1 && (
          <div
            ref={tablistRef}
            className="sf-tabs"
            role="tablist"
            aria-label={tabsLabel}
          >
            {tabs.map((tab) => {
              const selected = tab.id === activeTab?.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${tab.id}`}
                  data-tab-id={tab.id}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="sf-tab"
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={onKeyDown}
                >
                  {tab.label}
                </button>
              );
            })}
            <span
              className="sf-tab-ink"
              aria-hidden="true"
              style={{
                transform: `translateX(${ink.x}px) scaleX(${ink.width})`,
              }}
            />
          </div>
        )}
      </div>

      <div className="sf-carousel" ref={carouselRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            hidden={tab.id !== activeTab?.id}
            className="sf-row"
          >
            {tab.content}
          </div>
        ))}
        <button
          type="button"
          className="sf-car-arrow sf-car-prev"
          aria-label={scrollBackLabel}
          onClick={() => scrollRow(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sf-car-arrow sf-car-next"
          aria-label={scrollForwardLabel}
          onClick={() => scrollRow(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
