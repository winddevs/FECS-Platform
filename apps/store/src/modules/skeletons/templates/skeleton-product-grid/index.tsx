import repeat from "@lib/util/repeat";
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview";

const SkeletonProductGrid = ({
  // Matches PRODUCT_LIMIT in store/templates/paginated-products.tsx so the
  // footer does not jump when the real grid replaces the skeleton.
  numberOfProducts = 12,
}: {
  numberOfProducts?: number;
}) => {
  return (
    <ul
      className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8 flex-1"
      data-testid="products-list-loader"
    >
      {repeat(numberOfProducts).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  );
};

export default SkeletonProductGrid;
