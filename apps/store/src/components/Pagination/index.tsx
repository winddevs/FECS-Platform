"use client";
import {
  Pagination as PaginationComponent,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@ecommerce/ui/components/pagination";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import React from "react";

import { cn } from "@/utilities/ui";

export const Pagination: React.FC<{
  className?: string;
  page: number;
  totalPages: number;
}> = (props) => {
  const router = useRouter();
  const { locale, countryCode } = useParams<{
    locale: string;
    countryCode: string;
  }>();
  const t = useTranslations();
  const tPagination = useTranslations("components.pagination");

  const { className, page, totalPages } = props;
  const goToPage = (target: number) => {
    router.push(`/${locale}/${countryCode}/posts/page/${target}`);
  };
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const hasExtraPrevPages = page - 1 > 1;
  const hasExtraNextPages = page + 1 < totalPages;

  return (
    <div className={cn("my-12", className)}>
      <PaginationComponent aria-label={tPagination("label")}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-label={tPagination("goToPrevious")}
              text={t("previous")}
              disabled={!hasPrevPage}
              onClick={() => {
                goToPage(page - 1);
              }}
            />
          </PaginationItem>

          {hasExtraPrevPages && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}

          {hasPrevPage && (
            <PaginationItem>
              <PaginationLink
                onClick={() => {
                  goToPage(page - 1);
                }}
              >
                {page - 1}
              </PaginationLink>
            </PaginationItem>
          )}

          <PaginationItem>
            <PaginationLink
              isActive
              onClick={() => {
                goToPage(page);
              }}
            >
              {page}
            </PaginationLink>
          </PaginationItem>

          {hasNextPage && (
            <PaginationItem>
              <PaginationLink
                onClick={() => {
                  goToPage(page + 1);
                }}
              >
                {page + 1}
              </PaginationLink>
            </PaginationItem>
          )}

          {hasExtraNextPages && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}

          <PaginationItem>
            <PaginationNext
              aria-label={tPagination("goToNext")}
              text={t("next")}
              disabled={!hasNextPage}
              onClick={() => {
                goToPage(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </PaginationComponent>
    </div>
  );
};
