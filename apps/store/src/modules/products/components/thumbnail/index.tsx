import { Container, clx } from "@medusajs/ui";
import PlaceholderImage from "@modules/common/icons/placeholder-image";
import { useTranslations } from "next-intl";
import Image from "next/image";
import React from "react";

type ThumbnailProps = {
  thumbnail?: string | null;
  // TODO: Fix image typings
  images?: any[] | null;
  size?: "small" | "medium" | "large" | "full" | "square";
  isFeatured?: boolean;
  className?: string;
  /** Descriptive alt text, e.g. the product title. Falls back to a generic label. */
  alt?: string;
  "data-testid"?: string;
};

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured,
  className,
  alt,
  "data-testid": dataTestid,
}) => {
  const initialImage = thumbnail || images?.[0]?.url;

  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden p-4 bg-ui-bg-subtle shadow-elevation-card-rest rounded-large group-hover:shadow-elevation-card-hover transition-shadow ease-in-out duration-150",
        className,
        {
          "aspect-[11/14]": isFeatured,
          "aspect-[9/16]": !isFeatured && size !== "square",
          "aspect-[1/1]": size === "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder
        image={initialImage}
        alt={alt}
        size={size}
        isFeatured={isFeatured}
      />
    </Container>
  );
};

const ImageOrPlaceholder = ({
  image,
  alt,
  size,
  isFeatured,
}: Pick<ThumbnailProps, "size" | "alt"> & {
  image?: string;
  isFeatured?: boolean;
}) => {
  const t = useTranslations("products.images");

  return image ? (
    <Image
      src={image}
      alt={alt || t("thumbnail")}
      className="absolute inset-0 object-contain object-center"
      draggable={false}
      quality={50}
      sizes="(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"
      fill
      loading={isFeatured ? "eager" : undefined}
      priority={isFeatured}
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center">
      <PlaceholderImage size={size === "small" ? 16 : 24} />
    </div>
  );
};

export default Thumbnail;
