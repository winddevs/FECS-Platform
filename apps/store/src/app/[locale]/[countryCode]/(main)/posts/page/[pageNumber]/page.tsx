import config from "@payload-config";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next/types";
import { getPayload } from "payload";
import React from "react";

import { CollectionArchive } from "@/components/CollectionArchive";
import { PageRange } from "@/components/PageRange";
import { Pagination } from "@/components/Pagination";

import PageClient from "./page.client";

export const revalidate = 600;

type Args = {
  params: Promise<{
    pageNumber: string;
    locale: string;
  }>;
};

export default async function Page({ params: paramsPromise }: Args) {
  const { pageNumber, locale } = await paramsPromise;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const payload = await getPayload({ config });

  const sanitizedPageNumber = Number(pageNumber);

  if (!Number.isInteger(sanitizedPageNumber)) notFound();

  const posts = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 12,
    page: sanitizedPageNumber,
    overrideAccess: false,
  });

  return (
    <div className="pt-24 pb-24">
      <PageClient />
      <div className="content-container mb-16">
        <div className="prose dark:prose-invert max-w-none">
          <h1>{t("posts")}</h1>
        </div>
      </div>

      <div className="content-container mb-8">
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={12}
          totalDocs={posts.totalDocs}
        />
      </div>

      <CollectionArchive posts={posts.docs} />

      <div className="content-container">
        {posts?.page && posts?.totalPages > 1 && (
          <Pagination page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  );
}

export async function generateMetadata({
  params: paramsPromise,
}: Args): Promise<Metadata> {
  const { pageNumber, locale } = await paramsPromise;
  const t = await getTranslations({ locale, namespace: "components.posts" });
  return {
    title: t("pageTitle", { page: pageNumber || "" }),
  };
}

export async function generateStaticParams() {
  const payload = await getPayload({ config });
  const { totalDocs } = await payload.count({
    collection: "posts",
    overrideAccess: false,
  });

  const totalPages = Math.ceil(totalDocs / 10);

  const pages: { pageNumber: string }[] = [];

  for (let i = 1; i <= totalPages; i++) {
    pages.push({ pageNumber: String(i) });
  }

  return pages;
}
