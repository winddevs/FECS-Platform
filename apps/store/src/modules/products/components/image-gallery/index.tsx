import { Container } from "@medusajs/ui";
import { useTranslations } from "next-intl";
import Image from "next/image";

type ImageGalleryProps = {
  images: {
    id: string;
    url: string;
    alt?: string;
  }[];
};

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const t = useTranslations("products.images");

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => {
          return (
            <Container
              key={image.id}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              {!!image.url && (
                <Image
                  src={image.url}
                  priority={index <= 2 ? true : false}
                  className="absolute inset-0 rounded-rounded"
                  alt={image.alt || t("productImage", { number: index + 1 })}
                  fill
                  sizes="(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"
                  style={{
                    objectFit: "cover",
                  }}
                />
              )}
            </Container>
          );
        })}
      </div>
    </div>
  );
};

export default ImageGallery;
