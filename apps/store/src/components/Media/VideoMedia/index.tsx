"use client";

import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/utilities/ui";

import type { Props as MediaProps } from "../types";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Media fragment: ask for the frame at 1 ms, so browsers that load metadata only
 * (Safari, iOS) still draw the first frame instead of an empty box.
 */
const FIRST_FRAME = "#t=0.001";

/** Share of the video that must be on screen before it plays. */
const PLAY_VISIBLE_RATIO = 0.25;

/**
 * Looping, silent video (hero, lookbook).
 *
 * - `preload="metadata"`: the page load fetches the first bytes only, the file
 *   itself is read when the video starts playing.
 * - It plays only while it is on screen, so a video further down the page or in
 *   a scrolled-away section does not download or decode in the background.
 * - With "reduce motion" on, it does not start by itself and shows its controls.
 */
export const VideoMedia: React.FC<MediaProps> = (props) => {
  const { onClick, resource, videoClassName } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const url =
    resource && typeof resource === "object" ? (resource.url ?? null) : null;

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const { current: video } = videoRef;
    if (!video || reducedMotion) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // The browser may refuse to start (data saver, low-power mode). The
          // first frame then stays on screen, which is an acceptable fallback.
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: PLAY_VISIBLE_RATIO }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion, url]);

  if (!(resource && typeof resource === "object" && url)) {
    return null;
  }

  return (
    <video
      className={cn(videoClassName)}
      controls={reducedMotion}
      loop
      muted
      onClick={onClick}
      playsInline
      preload="metadata"
      ref={videoRef}
    >
      <source
        src={`${url}${FIRST_FRAME}`}
        type={resource.mimeType ?? undefined}
      />
    </video>
  );
};
