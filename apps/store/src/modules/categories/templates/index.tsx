import type { OptionValueGroup } from "@lib/data/product-options";
import { HttpTypes } from "@medusajs/types";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid";
import RefinementList from "@modules/store/components/refinement-list";
import { SortOptions } from "@modules/store/components/refinement-list/sort-products";
import PaginatedProducts from "@modules/store/templates/paginated-products";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { FilterOption } from "../../../types/filters";
import PageHero from "../../store/components/page-hero";

export default function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
  subcategories,
  types,
  tags,
  optionValues,
  typeId,
  tagId,
  priceFrom,
  priceTo,
}: {
  category: HttpTypes.StoreProductCategory;
  sortBy?: SortOptions;
  page?: string;
  countryCode: string;
  subcategories?: FilterOption[];
  types?: FilterOption[];
  tags?: FilterOption[];
  optionValues?: Record<string, OptionValueGroup>;
  typeId?: string[];
  tagId?: string[];
  priceFrom?: string;
  priceTo?: string;
}) {
  const pageNumber = page ? parseInt(page) : 1;
  const sort = sortBy || "created_at";

  if (!category || !countryCode) notFound();

  const parents = [] as HttpTypes.StoreProductCategory[];

  const getParents = (category: HttpTypes.StoreProductCategory) => {
    if (category.parent_category) {
      parents.push(category.parent_category);
      getParents(category.parent_category);
    }
  };

  getParents(category);

  const trail = parents.toReversed().map((parent) => ({
    label: parent.name,
    href: `/categories/${parent.handle}`,
  }));

  return (
    <>
      <PageHero
        title={category.name}
        description={category.description}
        trail={trail}
        data-testid="category-page-title"
      />
      <div
        className="sf-listing small:flex-row small:items-start small:gap-10"
        data-testid="category-container"
      >
        <RefinementList
          sortBy={sort}
          categories={subcategories}
          types={types}
          tags={tags}
          optionValues={optionValues}
        />
        <div className="w-full min-w-0">
          {category.category_children &&
            category.category_children.length > 0 && (
              <ul className="mb-8 flex flex-wrap gap-2">
                {category.category_children.map((child) => (
                  <li key={child.id}>
                    <LocalizedClientLink
                      className="sf-chip"
                      href={`/categories/${child.handle}`}
                    >
                      {child.name}
                    </LocalizedClientLink>
                  </li>
                ))}
              </ul>
            )}
          <Suspense
            fallback={
              <SkeletonProductGrid
                numberOfProducts={category.products?.length ?? 8}
              />
            }
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              categoryId={category.id}
              countryCode={countryCode}
              typeId={typeId}
              tagId={tagId}
              priceFrom={priceFrom}
              priceTo={priceTo}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}
