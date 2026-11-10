# Skill: performance

## Purpose

Core Web Vitals and bundle size optimization for Next.js pages.

## CWV targets

| Metric                          | Good    | Needs work |
| ------------------------------- | ------- | ---------- |
| LCP (Largest Contentful Paint)  | < 2.5s  | > 4s       |
| CLS (Cumulative Layout Shift)   | < 0.1   | > 0.25     |
| INP (Interaction to Next Paint) | < 200ms | > 500ms    |
| FCP (First Contentful Paint)    | < 1.8s  | > 3s       |

## Bundle size rules

```bash
# Check bundle after changes
npx @next/bundle-analyzer  # set ANALYZE=true in .env
```

- Page JS budget: < 200KB per route (compressed)
- Never import a full library when a single function is needed: `import debounce from 'lodash/debounce'` not `import _ from 'lodash'`
- Use dynamic imports for heavy components not needed on initial load:

```typescript
const HeavyChart = dynamic(() => import("@/components/HeavyChart"), {
  ssr: false,
});
```

## Image optimization

```tsx
// Always use next/image
import Image from "next/image";
<Image src="/hero.jpg" width={1200} height={600} priority alt="Hero" />;
```

- Set `priority` on above-the-fold images (prevents LCP penalty)
- Use `sizes` prop for responsive images
- Never use `<img>` directly — always `next/image`

## Layout shift prevention

- Reserve space for images with explicit `width`/`height` or `aspect-ratio` CSS
- Avoid injecting content above existing content after load
- Use `font-display: optional` or `swap` for custom fonts with `<link rel="preload">`

## Measuring

```bash
# Local Lighthouse
npx lighthouse https://localhost:3000 --output html --view

# CWV field data
PageSpeed Insights: https://pagespeed.web.dev/
```
