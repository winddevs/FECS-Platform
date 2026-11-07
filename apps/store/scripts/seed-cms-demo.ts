/**
 * Creates the first CMS admin and one published welcome post. Safe to repeat.
 *
 * Why this exists: the storefront build pre-renders every post
 * (generateStaticParams) and Cache Components refuses an empty list, so a brand
 * new CMS cannot be built until one post exists.
 *
 *   cd apps/store
 *   CMS_ADMIN_EMAIL=you@example.com CMS_ADMIN_PASSWORD=... CMS_API_KEY=... \
 *     npx payload run scripts/seed-cms-demo.ts

 * CMS_API_KEY is the key Medusa sends (`users API-Key <key>`, PAYLOAD_API_KEY in the
 * backend .env). It is stored on this user so Medusa can call the CMS API.
 *
 * Needs the same environment as the app (DATABASE_URL, PAYLOAD_SECRET, ...).
 * `scripts/deploy.sh seed-cms` sets all of it up through an SSH tunnel.
 */
import config from "@payload-config";
import { getPayload } from "payload";

const POST_SLUG = "chao-mung";

const paragraph = (text: string) => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr" as const,
  children: [
    {
      type: "text",
      text,
      version: 1,
      detail: 0,
      format: 0,
      mode: "normal",
      style: "",
    },
  ],
});

const richText = (...paragraphs: string[]) => ({
  root: {
    type: "root",
    format: "" as const,
    indent: 0,
    version: 1,
    direction: "ltr" as const,
    children: paragraphs.map((text) => paragraph(text)),
  },
});

const email = process.env.CMS_ADMIN_EMAIL;
const password = process.env.CMS_ADMIN_PASSWORD;
const apiKey = process.env.CMS_API_KEY;
if (!email || !password || !apiKey) {
  throw new Error(
    "CMS_ADMIN_EMAIL, CMS_ADMIN_PASSWORD and CMS_API_KEY are required"
  );
}

const payload = await getPayload({ config });
// Hooks call next/cache to revalidate pages; there is no Next process here.
const context = { disableRevalidate: true };

const existingUser = await payload.find({
  collection: "users",
  where: { email: { equals: email } },
  limit: 1,
  overrideAccess: true,
});
let userId: number;
if (existingUser.totalDocs > 0) {
  userId = existingUser.docs[0].id;
  // Make sure Medusa's key is on the user, even if the user already existed.
  await payload.update({
    collection: "users",
    id: userId,
    data: { enableAPIKey: true, apiKey },
    overrideAccess: true,
    context,
  });
  payload.logger.info(`CMS user ${email} already exists (API key set)`);
} else {
  const user = await payload.create({
    collection: "users",
    data: {
      email,
      password,
      name: "Admin",
      roles: ["admin"],
      enableAPIKey: true,
      apiKey,
    },
    overrideAccess: true,
    context,
  });
  userId = user.id;
  payload.logger.info(`Created CMS user ${email}`);
}

const existingPost = await payload.find({
  collection: "posts",
  where: { slug: { equals: POST_SLUG } },
  limit: 1,
  draft: false,
  overrideAccess: true,
});
if (existingPost.totalDocs > 0) {
  payload.logger.info(`Post "${POST_SLUG}" already exists`);
} else {
  const post = await payload.create({
    collection: "posts",
    locale: "vi",
    data: {
      title: "Chào mừng đến với cửa hàng",
      slug: POST_SLUG,
      content: richText(
        "Đây là bài viết mẫu. Bạn có thể sửa hoặc xóa nó trong trang quản trị CMS."
      ),
      authors: [userId],
      publishedAt: new Date().toISOString(),
      _status: "published",
    },
    overrideAccess: true,
    context,
  });
  await payload.update({
    collection: "posts",
    id: post.id,
    locale: "en",
    data: {
      title: "Welcome to the store",
      content: richText(
        "This is a sample post. Edit or delete it in the CMS admin."
      ),
    },
    overrideAccess: true,
    context,
  });
  payload.logger.info(`Created post "${POST_SLUG}" (vi + en)`);
}

process.exit(0);
