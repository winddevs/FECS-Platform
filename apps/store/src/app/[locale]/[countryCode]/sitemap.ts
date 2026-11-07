import fs from "node:fs";

import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing"; // Import your routing configuration

// Top-level route folders to list in the sitemap. The folder is a leftover of
// the template this app started from and does not exist here: reading it at
// import time crashed `next build`, so a missing folder now means "no extra pages".
const readAppFolders = () => {
  try {
    return fs.readdirSync("www", { withFileTypes: true });
  } catch {
    return [];
  }
};
const appFolders = readAppFolders();
const pages = appFolders
  .filter((file) => file.isDirectory())
  .filter((folder) => !folder.name.startsWith("_"))
  .filter((folder) => !folder.name.startsWith("("))
  .map((folder) => folder.name);

// Determine the URL base. NEXT_PUBLIC_WWW_URL may be a full URL
// (https://example.com) or a bare host (example.com).
const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL ?? "localhost:3000";
const url = new URL(/^https?:\/\//.test(wwwUrl) ? wwwUrl : `http://${wwwUrl}`);

// Define async function to fetch any dynamic content (like blog posts)
// Example for blog posts if you have them
async function getBlogPosts() {
  try {
    // Replace with your actual method to fetch blog posts
    // const posts = await blog.getPosts();
    // return posts.map((post) => post._slug);
    return []; // Placeholder if you don't have blog posts
  } catch (error) {
    console.error("Error fetching blog posts for sitemap:", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get any dynamic content
  const blogPosts = await getBlogPosts();

  // Create sitemap items array
  const sitemapItems: MetadataRoute.Sitemap = [];

  // Add locale-specific home pages with high priority
  for (const locale of routing.locales) {
    sitemapItems.push({
      url: new URL(`/${locale}`, url).href,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    });
  }

  // Add all regular pages for each locale
  for (const locale of routing.locales) {
    for (const page of pages) {
      if (page !== "api" && page !== "sitemap.xml") {
        // Skip non-page directories
        sitemapItems.push({
          url: new URL(`/${locale}/${page}`, url).href,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.8,
        });
      }
    }
  }

  // Add blog posts for each locale if you have them
  for (const locale of routing.locales) {
    for (const post of blogPosts) {
      sitemapItems.push({
        url: new URL(`/${locale}/blog/${post}`, url).href,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return sitemapItems;
}
