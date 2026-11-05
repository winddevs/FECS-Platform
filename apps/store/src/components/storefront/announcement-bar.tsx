"use client";

import { useEffect, useState } from "react";

const ROTATE_INTERVAL_MS = 4500;

type AnnouncementBarProps = {
  label: string;
  messages: string[];
};

/** Rotating one-line announcements above the header. */
export function AnnouncementBar({ label, messages }: AnnouncementBarProps) {
  const [{ active, leaving }, setSlides] = useState<{
    active: number;
    leaving: number | null;
  }>({ active: 0, leaving: null });

  useEffect(() => {
    if (messages.length < 2) {
      return;
    }

    const timer = setInterval(() => {
      setSlides((current) => ({
        active: (current.active + 1) % messages.length,
        leaving: current.active,
      }));
    }, ROTATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <section className="sf-announcement" aria-label={label}>
      {messages.map((message, index) => {
        const isActive = index === active;
        const isLeaving = index === leaving && !isActive;
        const className = [
          "sf-announcement-slide",
          isActive ? "is-active" : "",
          isLeaving ? "is-leaving" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <p key={message} className={className} aria-hidden={!isActive}>
            {message}
          </p>
        );
      })}
    </section>
  );
}
