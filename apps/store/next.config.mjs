import { withPayload } from "@payloadcms/next/withPayload";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const r2Hostname = process.env.NEXT_PUBLIC_R2_HOSTNAME;

/**
 * Allow next/image to load files from the S3/MinIO public URL
 * (e.g. https://minio.example.com/my-bucket or http://localhost:9000/my-bucket).
 */
const getS3RemotePattern = () => {
  if (!process.env.S3_FILE_URL) {
    return null;
  }
  try {
    const { protocol, hostname, port } = new URL(process.env.S3_FILE_URL);
    return {
      protocol: protocol.replace(":", ""),
      hostname,
      ...(port ? { port } : {}),
    };
  } catch {
    return null;
  }
};
const s3RemotePattern = getS3RemotePattern();

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  transpilePackages: ["@ecommerce/medusa"],
  turbopack: {
    root: new URL("../../", import.meta.url).pathname,
  },
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    qualities: [50, 75],
    // Media file names are unique and never overwritten, so a resized copy
    // can be kept for 31 days instead of the 4 hour default.
    minimumCacheTTL: 2_678_400,
    // Dev only: lets next/image fetch from a MinIO container on localhost.
    // Keep this off in production (SSRF protection).
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      ...(s3RemotePattern ? [s3RemotePattern] : []),
      ...(r2Hostname
        ? [
            {
              protocol: "https",
              hostname: r2Hostname,
            },
          ]
        : []),
    ],
  },
};

// Export the config with Payload integration
export default withPayload(withNextIntl(nextConfig), {
  devBundleServerPackages: false,
});
