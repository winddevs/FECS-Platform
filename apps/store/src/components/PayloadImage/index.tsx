"use client";

import type { ImageLoaderProps, ImageProps } from "next/image";
import NextImage from "next/image";

import { buildImgproxyURL } from "@/utilities/imgproxy";

/** Resizes through imgproxy; Cloudflare caches the result. */
const imgproxyLoader = ({ src, width }: ImageLoaderProps): string =>
  buildImgproxyURL(src, width) ?? src;

/**
 * next/image for files uploaded in the Payload media library.
 * Use it instead of next/image for `media.url` values.
 *
 * Sources that are not Payload media (or builds without imgproxy) keep using
 * Next's own optimizer, so nothing else on the site changes.
 */
export const PayloadImage = (props: ImageProps) => {
  const { src, unoptimized } = props;
  const canUseImgproxy =
    typeof src === "string" &&
    !unoptimized &&
    buildImgproxyURL(src, 1) !== null;

  return (
    <NextImage
      {...props}
      loader={canUseImgproxy ? imgproxyLoader : undefined}
    />
  );
};
