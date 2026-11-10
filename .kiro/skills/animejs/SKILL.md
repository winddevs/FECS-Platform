---
name: animejs
description: This skill should be used when the user asks to "use anime.js", "animejs", "animate with anime()", "stagger animation", "anime.js timeline", "anime.js scroll animation / onScroll", "split text animation", "text scramble", "draw SVG lines / morph SVG / motion path with anime", "draggable element", "auto layout animation", "WAAPI animation with anime", "animate Three.js objects", or "migrate anime.js v3 to v4". Covers Anime.js v4 (`animejs` package, github.com/juliangarnier/anime) - animate, createTimeline, stagger, onScroll, createScope, splitText, createDrawable, morphTo, createMotionPath, createAnimatable, createDraggable, createLayout, waapi, createSpring.
version: 0.1.0
---

# Anime.js v4

Anime.js is a small, MIT-licensed, modular JS animation engine. It animates CSS properties, CSS transforms, SVG attributes, DOM attributes, and plain JS objects (and, via an adapter, Three.js objects). This skill targets **v4** (`animejs@4.x`, ESM, named imports). Most online snippets are v3 and will not run, so check the migration table below before copying any.

## When to use

- Staggered, grid, or timeline-sequenced UI motion with a small bundle
- SVG line drawing, shape morphing, motion along a path
- Scroll-synced or scroll-triggered animation (`onScroll`)
- Text split into lines/words/chars, and text scramble reveals
- Draggable, snappable, flick/throw elements with spring release
- Layout transitions (accordion, list reorder, grid changes) via `createLayout`
- Animating plain objects, canvas values, or Three.js objects

If the project already has a GSAP timeline or ScrollTrigger in the same view, keep that view on GSAP. Do not run two engines on the same element's transforms. See "Anime.js vs GSAP vs CSS" below.

## Install and import

```bash
pnpm add animejs   # or npm i animejs
```

```ts
import { animate, createTimeline, stagger, onScroll, utils } from "animejs";
```

Tree-shakeable subpaths exist for minimal bundles: `animejs/animation`, `animejs/timeline`, `animejs/timer`, `animejs/animatable`, `animejs/draggable`, `animejs/scope`, `animejs/engine`, `animejs/events` (scroll), `animejs/layout`, `animejs/easings`, `animejs/utils`, `animejs/svg`, `animejs/text`, `animejs/waapi`, `animejs/adapters/three`. Prefer specific imports and no barrel re-exports of your own (Ultracite rule).

No bundler: use the UMD build from a CDN (`https://cdn.jsdelivr.net/npm/animejs/dist/bundles/anime.umd.min.js`), which exposes a global `anime` object holding the same named exports (`anime.animate`, `anime.stagger`, ...).

## Core API in 60 seconds

```ts
import { animate, stagger } from "animejs";

const animation = animate(".square", {
  x: 320, // individual CSS transform props: x, y, z, rotate, rotateX/Y/Z, scale, skew...
  rotate: { from: -180 }, // per-property params: from / to / duration / delay / ease
  opacity: [0, 1], // [from, to] shorthand
  duration: 1250, // ms
  delay: stagger(65, { from: "center" }),
  ease: "inOutQuint", // default is 'out(2)'
  loop: true,
  alternate: true,
});
```

- Signature is `animate(targets, parameters)`. Targets: CSS selector, element, NodeList, array, or plain object.
- Values: number, unit string (`'50%'`, `'10vw'`), relative (`'+=100'`, `'-=20'`, `'*=2'`), color, keyframes array (`y: [0, -40, 0]` or `[{ to: -40, ease: 'out' }, { to: 0 }]`), or a **function** `(el, index, total) => value`.
- Animation-level params: `duration`, `delay`, `ease`, `loop` (repeat count, `true` = infinite), `loopDelay`, `alternate`, `reversed`, `autoplay`, `playbackRate`, `composition` (`'replace' | 'blend' | 'none'`), `modifier`.
- Callbacks: `onBegin`, `onUpdate`, `onRender`, `onLoop`, `onPause`, `onComplete`. `onBegin` fires after `delay`.
- Controls: `.play()`, `.reverse()`, `.pause()`, `.resume()`, `.restart()`, `.alternate()`, `.seek(ms)`, `.stretch(ms)`, `.complete()`, `.cancel()`, `.revert()`, `.refresh()`. `await animation` (or `.then()`) resolves on completion.
- `.revert()` restores inline styles to pre-animation state. Always call it (or revert a scope) on component unmount.

### Timeline

```ts
import { createTimeline, stagger } from "animejs";

const tl = createTimeline({ defaults: { duration: 600, ease: "outQuad" } })
  .add(".hero-title", { y: [24, 0], opacity: [0, 1] })
  .add(".hero-sub", { y: [16, 0], opacity: [0, 1] }, "-=300") // 300ms before previous ends
  .add(".card", { scale: [0.9, 1], opacity: [0, 1] }, stagger(80)) // stagger positions
  .label("cta")
  .add(".cta", { scale: [0.95, 1] }, "cta+=100")
  .call(() => setReady(true), "+=0"); // callback on the timeline
```

Position argument: number (absolute ms), `'+=n'` / `'-=n'` / `'*=n'` (relative to end of timeline), `'<'` (end of previous child), `'<<'` (start of previous child), `'<<+=200'`, a `label`, `'label+=n'`, or a `stagger()`. Also `.sync(otherTimeline, position)` and `.add(timerParams, position)`.

### Stagger

`stagger(value, params)` where `value` is a number (time offset or step), a range `[a, b]`, or strings with units. Params: `start`, `from` (`'first' | 'center' | 'last' | 'random' | index`), `reversed`, `grid: [cols, rows]`, `axis: 'x' | 'y'`, `ease`, `modifier`, `total`, `use`. It works for `delay`, any property value, and timeline positions.

```ts
animate(".dot", {
  scale: stagger([1.1, 0.75], { grid: [13, 13], from: "center" }),
  delay: stagger(60, { grid: [13, 13], from: "center" }),
  ease: "inOutQuad",
});
```

### Easings

String names drop v3's `ease` prefix: `'linear'`, `'in'`, `'out'`, `'inOut'`, `'inQuad'`, `'outCubic'`, `'inOutExpo'`, `'outElastic(1, .3)'`, `'out(3)'` (power), `'outBack'`, `'outBounce'`. Helpers: `createSpring({ stiffness, damping, mass, velocity })` (or `spring({ bounce, duration })`), `cubicBezier(x1, y1, x2, y2)`, `steps(n)`, `irregular(steps, randomness)`. A plain `(t) => number` function is also a valid `ease`.

## Feature map (details in `references/cookbook.md`)

| Need                                   | API                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tween anything                         | `animate(targets, params)`                                                                                                         |
| Sequence                               | `createTimeline()` -> `.add()`, `.label()`, `.call()`, `.sync()`                                                                   |
| Scroll sync / trigger                  | `onScroll({ target, container, enter, leave, sync, repeat })`, `.link(animation)`                                                  |
| SVG line draw                          | `animate(createDrawable('path'), { draw: '0 1' })`                                                                                 |
| SVG morph                              | `animate('#a', { d: morphTo('#b') })`                                                                                              |
| Motion path                            | `animate(el, { ...createMotionPath('#path') })`                                                                                    |
| Split text                             | `splitText(el, { lines, words, chars })` + `.addEffect()` + `.revert()`                                                            |
| Scramble text                          | `animate(el, { innerHTML: scrambleText({ text, chars, from, cursor }) })`                                                          |
| Interactive follow (mouse, no re-init) | `createAnimatable(targets, { x: { duration }, ... })` then call `anim.x(value)`                                                    |
| Drag, snap, flick                      | `createDraggable(el, { x, y, snap, container, releaseEase })`                                                                      |
| Layout transitions                     | `createLayout(root, params).update(() => mutateDOM())`                                                                             |
| Native WAAPI (GPU, off-main-thread)    | `waapi.animate(targets, params)`                                                                                                   |
| Responsive + cleanup                   | `createScope({ root, mediaQueries, defaults }).add(fn)`, `scope.revert()`                                                          |
| Timers / manual loop                   | `createTimer()`, `engine` (`useDefaultMainLoop`, `pauseOnDocumentHidden`, `speed`)                                                 |
| Helpers                                | `utils.$`, `utils.get/set/remove`, `random`, `randomPick`, `shuffle`, `round`, `clamp`, `snap`, `wrap`, `mapRange`, `lerp`, `damp` |
| Three.js objects                       | `import 'animejs/adapters/three'` then `animate(mesh, { x, rotateY, opacity, color })`                                             |

## v3 -> v4 migration (most common breakage)

| v3                                           | v4                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `import anime from 'animejs'`                | `import { animate } from 'animejs'`                                                   |
| `anime({ targets: el, ... })`                | `animate(el, { ... })`                                                                |
| `easing: 'easeOutQuad'`                      | `ease: 'outQuad'`                                                                     |
| `translateX: 100`                            | `x: 100` (`translateX` still works)                                                   |
| `{ value: 1, duration: 200 }`                | `{ to: 1, duration: 200 }`                                                            |
| `direction: 'reverse'` / `'alternate'`       | `reversed: true` / `alternate: true`                                                  |
| `loop: 1` meant 1 iteration                  | `loop: 1` means repeat once (2 iterations)                                            |
| `endDelay`                                   | `loopDelay` (only between loops)                                                      |
| `round: 100`                                 | `modifier: utils.round(2)`                                                            |
| `update` / `begin` / `complete`              | `onUpdate` / `onBegin` / `onComplete`                                                 |
| `loopBegin` + `loopComplete`                 | `onLoop`                                                                              |
| `change`                                     | `onRender`                                                                            |
| `anime.timeline({ easing, duration })`       | `createTimeline({ defaults: { ease, duration } })`                                    |
| `animation.finished.then(...)`               | `animation.then(...)` / `await animation`                                             |
| `anime.path('path')`                         | `createMotionPath('path')` -> `{ translateX, translateY, rotate }`                    |
| `strokeDashoffset: [anime.setDashoffset, 0]` | `animate(createDrawable('path'), { draw: '0 1' })`                                    |
| `easing: 'spring(1, 80, 10, 0)'`             | `ease: createSpring({ mass: 1, stiffness: 80, damping: 10 })`                         |
| `anime.random / get / set / remove`          | `utils.random / get / set / remove`                                                   |
| `anime.suspendWhenDocumentHidden`            | `engine.pauseOnDocumentHidden`                                                        |
| `.play()` after reverse resumed backwards    | `.play()` always forwards, `.reverse()` always backwards, `.resume()` keeps direction |

## Gotchas

- **Default ease is `out(2)`**, not linear. Pass `ease: 'linear'` for scrubbed/looping progress.
- **Cleanup is manual.** In React, create animations inside `useEffect` and return a cleanup that calls `scope.revert()` (preferred) or `animation.revert()`. See `references/react-nextjs.md`.
- **Client only.** The library touches `window`/`document`. In Next.js App Router, use it only in `"use client"` components, inside effects. Never at module top level of a Server Component.
- **Do not animate layout properties** (`width`, `height`, `top`, `left`, `margin`) in hot paths. Animate `x`, `y`, `scale`, `rotate`, `opacity`, `filter`. For layout changes use `createLayout`.
- **Mixed transform sources.** Anime.js composes individual transforms (`x`, `rotate`, `scale`). Do not also set `transform` in CSS on the same element or animate it with GSAP/CSS keyframes. Use `composition: 'blend'` only when intentionally overlapping animations on the same property.
- **`createDrawable` replaces the element's stroke dash setup**, so the target must be a stroked shape (`fill: none; stroke: ...`). `draw` is a `'start end'` string of 0 to 1 values.
- **`splitText` mutates the DOM** and re-splits on resize (lines). Put animations in `.addEffect()` so they rebuild after a re-split. Call `.revert()` on cleanup. `accessible: true` (default) inserts a visually hidden copy of the original text and marks the split pieces `aria-hidden`, so screen readers read the original text once.
- **`onScroll` positions** are `'<container> <target>'`, e.g. `enter: 'bottom top'` means the container's bottom edge meets the target's top edge. `sync: true` (or a number for smoothing, or an ease name) scrubs. Default sync (`'play pause'`) plays on enter and pauses on leave. `sync: 'play reverse'` and `'play pause resume reset'` style method lists are also valid.
- **`autoplay` takes an observer**: `autoplay: onScroll({ ... })` links the animation at creation time. Use `.link(animation)` on an observer created separately.
- **Speed and time units**: durations are in ms by default. `engine.timeUnit = 's'` switches the whole engine to seconds. Do not change it in shared code.

## Anime.js vs GSAP vs CSS

| Situation                                                                                     | Pick                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------- |
| Hover/focus/state transitions, simple enter/exit                                              | CSS                                |
| Single element, compositor-only props, no sequencing                                          | CSS or `waapi.animate`             |
| Staggers, grids, timelines, SVG draw/morph, text split, drag, layout transitions, tiny bundle | Anime.js                           |
| Complex pinned scroll storytelling, ScrollTrigger + Lenis already in use                      | GSAP (`gsap-web` skill)            |
| Route/page transitions                                                                        | `page-transition-animation` skill  |
| Declarative React gesture/layout animation                                                    | Motion (`micro-interaction` skill) |

Pick one engine per element. Mixing is fine across unrelated components.

## Accessibility and performance (apply to every animation)

- Honor `prefers-reduced-motion`. Gate loops, large travel, parallax, and scroll scrubbing. Keep the final state. Use `createScope({ mediaQueries: { reduce: '(prefers-reduced-motion: reduce)' } })` and branch on `scope.matches.reduce`. Pattern in `references/react-nextjs.md`. See also the `accessible-animation` skill.
- Do not hide content behind an animation that may never run (JS disabled, error, reduced motion). Set the final state in CSS and animate **from** the hidden state, or set initial state in the effect.
- Animate `transform` and `opacity`. Avoid `filter: blur()` on large areas and avoid animating hundreds of elements with `box-shadow`.
- Use `waapi.animate` for simple transform/opacity tweens that must stay smooth while the main thread is busy.
- Stop offscreen work: scope `onScroll` with `repeat: false` or `revert()` when out of view; engine pauses automatically when the tab is hidden (`pauseOnDocumentHidden`, default `true`).
- Follow the repo's Ultracite rules: no `console.log`, `for...of` over `.forEach`, named constants for durations and delays instead of magic numbers.

## Verify

1. Imports resolve from `animejs` (v4 named exports). No `anime(...)` default calls remain.
2. Component unmount path reverts the scope or animation. No leaked observers after route changes.
3. `prefers-reduced-motion: reduce` renders the final state without large motion.
4. No hydration warnings: nothing runs during SSR, initial server HTML equals the visible final (or intentionally hidden) state.
5. Run `node --run ultracite check` on touched files.

## Reference files

- `references/cookbook.md` - copy-ready recipes: timeline hero, scroll scrub and scroll trigger, SVG draw/morph/motion path, split text and scramble, createAnimatable cursor follow, draggable carousel, createLayout accordion, WAAPI, Three.js adapter, and function-based values.
- `references/react-nextjs.md` - React 19 / Next.js App Router integration: `createScope` hook, cleanup, reduced motion, SSR rules, route changes, and a typed reusable hook.

Sources: [juliangarnier/anime](https://github.com/juliangarnier/anime) (README, v3 to v4 migration guide, and source for v4.5.0), [animejs.com documentation](https://animejs.com/documentation).
