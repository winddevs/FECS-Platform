import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview";

const PLACEHOLDER_COUNT = 4;
const PLACEHOLDER_KEYS = Array.from(
  { length: PLACEHOLDER_COUNT },
  (_, index) => `placeholder-${index}`
);

/** Shown while the home data loads: an empty hero and a row of card shapes. */
export default function HomeFallback() {
  return (
    <>
      <div className="sf-hero" aria-hidden="true" />
      <div className="sf-section" aria-hidden="true">
        <ul className="sf-grid">
          {PLACEHOLDER_KEYS.map((key) => (
            <li key={key}>
              <SkeletonProductPreview />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
