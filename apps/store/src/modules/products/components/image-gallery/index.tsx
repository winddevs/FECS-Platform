"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

type ImageGalleryProps = {
  images: {
    id: string;
    url: string;
    alt?: string;
  }[];
  /** Product title, used for the placeholder initial and the default alt. */
  title?: string;
};

const STAGE_SIZES = "(max-width: 1023px) 100vw, 55vw";

const ImageGallery = ({ images, title = "" }: ImageGalleryProps) => {
  const t = useTranslations("products.images");
  const [index, setIndex] = useState(0);

  const visible = images.filter((image) => !!image.url);
  const count = visible.length;
  const current = visible[index] ?? visible[0];

  const go = (next: number) => setIndex((next + count) % count);

  const altFor = (position: number) =>
    visible[position]?.alt || t("productImage", { number: position + 1 });

  return (
    <div className="sf-gallery" data-testid="product-gallery">
      <div className="sf-stage">
        {current ? (
          <Image
            key={current.id}
            src={current.url}
            alt={altFor(index)}
            fill
            priority
            sizes={STAGE_SIZES}
            quality={80}
            draggable={false}
          />
        ) : (
          <span className="sf-card-placeholder" aria-hidden="true">
            {title.charAt(0)}
          </span>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              className="sf-stage-arrow sf-stage-prev"
              aria-label={t("previous")}
              onClick={() => go(index - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sf-stage-arrow sf-stage-next"
              aria-label={t("next")}
              onClick={() => go(index + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="sf-thumbs">
          {visible.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                className="sf-thumb"
                aria-label={t("showImage", { number: position + 1 })}
                aria-current={position === index}
                onClick={() => setIndex(position)}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="76px"
                  quality={50}
                  draggable={false}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ImageGallery;
