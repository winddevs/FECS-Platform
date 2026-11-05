import repeat from "@lib/util/repeat";
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview";

const SkeletonRelatedProducts = () => {
  return (
    <div>
      <div className="mb-11 flex flex-col items-center gap-4">
        <div className="sf-skeleton h-4 w-24" />
        <div className="sf-skeleton h-10 w-72 max-w-full" />
      </div>
      <ul className="sf-grid flex-1">
        {repeat(3).map((index) => (
          <li key={index}>
            <SkeletonProductPreview />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SkeletonRelatedProducts;
