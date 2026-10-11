import config from "@payload-config";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next/types";
import { getPayload } from "payload";
import React from "react";

import { CollectionArchive } from "@/components/CollectionArchive";
import { PageRange } from "@/components/PageRange";
import { Pagination } from "@/components/Pagination";

import PageClient from "./page.client";

export const dynamic = "force-static";
export const revalidate = 600;

type Args = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function Page({ params }: Args) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const payload = await getPayload({ config });

  const posts = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 12,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      categories: true,
      meta: true,
    },
  });

  return (
    <div className="pt-24 pb-24">
      <PageClient />
      <div className="content-container mb-16">
        <div className="prose dark:prose-invert max-w-none">
          <h1>{t("posts")}</h1>
        </div>
      </div>

      <div className="content-container mb-8 fade-top-border">
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={12}
          totalDocs={posts.totalDocs}
        />
      </div>

      <CollectionArchive posts={posts.docs} />

      <div className="content-container">
        {posts.totalPages > 1 && posts.page && (
          <Pagination page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "components.posts" });
  return {
    title: t("blogTitle"),
  };
}
