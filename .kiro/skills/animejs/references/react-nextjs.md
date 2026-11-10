# Anime.js in React 19 and Next.js App Router

Anime.js is imperative and DOM-bound. In this repo's storefront it must run only in client components, inside effects, with deterministic cleanup.

## Rules

1. Add `"use client"` to any file that imports `animejs` and runs it. Server Components must not call `animate`, `createTimeline`, `onScroll`, `splitText`, and so on.
2. Create animations in `useEffect` (or `useLayoutEffect` for layout measurement). Never during render.
3. Wrap every effect in a `createScope({ root })` and return `() => scope.revert()`. A scope tracks every animation, timeline, observer, draggable, and splitter created inside `.add()` and reverts them together, which also makes React Strict Mode double-invocation safe.
4. Scope selectors to the component with `root`, so `".card"` only matches this component's cards.
5. Put the final, visible state in markup and CSS. Set the hidden starting state inside the effect (`utils.set` or `from` values), so SSR output and no-JS users see content.
6. Gate motion on `prefers-reduced-motion`.
7. Respect Ultracite: no `console.log`, named constants instead of magic numbers, `for...of` instead of `forEach`.

## Reusable hook

```tsx
"use client";

import { createScope, type Scope } from "animejs";
import { type RefObject, useEffect } from "react";

type ScopeSetup = (scope: Scope) => void;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Runs `setup` once on mount inside an Anime.js scope rooted at `rootRef`.
 * Everything created in `setup` is reverted on unmount.
 * `scope.matches.reduceMotion` is true when the user prefers reduced motion.
 */
export const useAnimeScope = <T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  setup: ScopeSetup
): void => {
  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const scope = createScope({
      root: rootRef,
      mediaQueries: { reduceMotion: REDUCED_MOTION_QUERY },
    }).add((self) => {
      setup(self);
    });

    return () => scope.revert();
  }, [rootRef, setup]);
};
```

`createScope({ root })` accepts a selector, an element, or a React ref (it reads `.current`). `setup` is a dependency, so callers must pass a stable function: define it at module level when it needs no props, or wrap it in `useCallback` with the props it reads. An inline arrow would rebuild the scope on every render. If the `Scope` type is not exported by your installed version, use `ReturnType<typeof createScope>`.

Each example below passes a module-level `setup` function for that reason.

## Component example: staggered reveal with reduced-motion fallback

```tsx
"use client";

import { animate, type Scope, stagger, utils } from "animejs";
import { useRef } from "react";

import { useAnimeScope } from "./use-anime-scope";

const REVEAL_DURATION_MS = 600;
const REVEAL_STAGGER_MS = 70;
const REVEAL_OFFSET_PX = 24;

const revealProducts = (scope: Scope) => {
  if (scope.matches.reduceMotion) {
    return; // markup already shows the final state
  }

  utils.set(".product-card", { opacity: 0, y: REVEAL_OFFSET_PX });
  animate(".product-card", {
    opacity: 1,
    y: 0,
    duration: REVEAL_DURATION_MS,
    ease: "out(3)",
    delay: stagger(REVEAL_STAGGER_MS),
  });
};

export function ProductGrid({
  products,
}: {
  products: readonly { id: string; title: string }[];
}) {
  const rootRef = useRef<HTMLUListElement>(null);

  useAnimeScope(rootRef, revealProducts);

  return (
    <ul ref={rootRef}>
      {products.map((product) => (
        <li className="product-card" key={product.id}>
          {product.title}
        </li>
      ))}
    </ul>
  );
}
```

Mixing client and server: the parent Server Component fetches products from Medusa and passes plain props to this client component. Do not pass functions or class instances across the boundary.

If `utils.set(... opacity: 0)` causes a flash before hydration, give the initial state in CSS behind a class that the effect removes, or hide with `visibility: hidden` and let the first animation frame reveal it. Prefer animating **from** a value (`opacity: [0, 1]`) so the end state always equals the DOM's real style.

## Scroll-triggered section

```tsx
"use client";

import { animate, onScroll, type Scope } from "animejs";
import { useRef } from "react";

import { useAnimeScope } from "./use-anime-scope";

const revealStats = (scope: Scope) => {
  if (scope.matches.reduceMotion) {
    return;
  }

  animate(".stat", {
    opacity: [0, 1],
    y: [32, 0],
    ease: "out(3)",
    autoplay: onScroll({
      target: scope.root, // the section element passed as `root`
      enter: "bottom 80%",
      repeat: false,
    }),
  });
};

export function StatsSection() {
  const rootRef = useRef<HTMLElement>(null);

  useAnimeScope(rootRef, revealStats);

  return <section ref={rootRef}>{/* .stat children */}</section>;
}
```

Observers created inside the scope are reverted on unmount, so no manual `removeEventListener` is needed. If the page also uses Lenis or another smooth scroller, pass that scroller's wrapper as `container`, and verify scroll positions after route transitions (call `observer.refresh()` once layout settles).

## Split text headline

```tsx
"use client";

import { animate, type Scope, splitText, stagger } from "animejs";
import { useRef } from "react";

import { useAnimeScope } from "./use-anime-scope";

const WORD_STAGGER_MS = 40;

const revealHeadline = (scope: Scope) => {
  if (scope.matches.reduceMotion) {
    return;
  }

  const split = splitText(scope.root as HTMLElement, {
    words: { wrap: "clip" },
  });
  split.addEffect((s) =>
    animate(s.words, {
      y: ["100%", "0%"],
      duration: 700,
      ease: "out(4)",
      delay: stagger(WORD_STAGGER_MS),
    })
  );
  // splitText registers with the active scope, so scope.revert() restores the original markup
};

export function AnimatedHeadline({ text }: { text: string }) {
  const rootRef = useRef<HTMLHeadingElement>(null);

  useAnimeScope(rootRef, revealHeadline);

  return <h1 ref={rootRef}>{text}</h1>;
}
```

`splitText` replaces the element's inner HTML. Render plain text (or simple inline markup) inside the element and avoid React-managed children that change after the split, or React and the splitter will fight over the same DOM nodes. If `text` changes, remount the component with `key={text}` so the scope is rebuilt against fresh markup.

## Route changes and Suspense

- App Router keeps layouts mounted across navigation, so animations in `layout.tsx` client components persist. Animations in `page.tsx` children unmount and revert with the page.
- For exit animations before navigation, see the `page-transition-animation` skill. Anime.js can drive the exit (`await animate(...)`) before calling `router.push`, but wrap it so a rejected or interrupted animation still navigates.
- Components that stream in behind `<Suspense>` run their effect when they mount, so each streamed boundary animates independently. Avoid page-wide timelines that assume all children exist at once.

## Testing and debugging

- Unit tests (jsdom) rarely need real animations. Mock `animejs` or set `engine.speed` high. Do not assert on pixel positions.
- `onScroll({ debug: true })` draws the enter/leave markers.
- Inspect the active timeline by assigning it to a variable and calling `.seek(ms)` from the console to freeze a frame.
- If an animation "does nothing" on a second mount, check for a missing `revert()` leaving stale inline styles, or a scope created with the wrong `root`.

## Checklist

- [ ] File has `"use client"`
- [ ] Animations created in effect, wrapped in `createScope`, reverted in cleanup
- [ ] Selectors scoped by `root`
- [ ] `prefers-reduced-motion` branch present
- [ ] Final state visible without JS
- [ ] No layout-property animation in hot paths
- [ ] `node --run ultracite check` passes
