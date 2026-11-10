# Anime.js v4 Cookbook

Copy-ready recipes. All use v4 named imports from `animejs`. Durations are ms. In React/Next.js, run these inside a `useEffect` in a `"use client"` component and revert on cleanup (see `react-nextjs.md`).

## Contents

1. Function-based values and keyframes
2. Hero timeline
3. Scroll: scrub, trigger, sticky sequence
4. SVG: draw, morph, motion path
5. Text: split, effects, scramble
6. createAnimatable: cursor follow
7. Draggable: snap carousel with spring release
8. createLayout: accordion and list changes
9. WAAPI
10. Three.js adapter
11. Timer, engine, utils

---

## 1. Function-based values and keyframes

```ts
import { animate, stagger, utils } from "animejs";

animate(".shape", {
  x: () => utils.random(-100, 100),
  y: (_el, i) => i * 12,
  rotate: { from: (_el, i) => (i % 2 ? "-20deg" : "20deg"), to: 0 },
  duration: () => utils.random(500, 1000),
  composition: "blend", // blend with a still-running animation on the same props
});

// Keyframes: array of values, or array of per-step params
animate(".ball", {
  y: [
    { to: -60, ease: "outQuad" },
    { to: 0, ease: "inBounce", duration: 700 },
  ],
  scale: [1, 1.2, 1],
});
```

Per-property override of timing: `opacity: { to: 1, duration: 300, delay: 100, ease: "linear" }`.

## 2. Hero timeline

```ts
import { createTimeline, stagger } from "animejs";

const HERO_DURATION = 700;
const CARD_STAGGER = 90;

export const createHeroTimeline = () =>
  createTimeline({ defaults: { duration: HERO_DURATION, ease: "outCubic" } })
    .add(".hero-eyebrow", { opacity: [0, 1], y: [12, 0] })
    .add(".hero-title", { opacity: [0, 1], y: [24, 0] }, "-=500")
    .add(".hero-cta", { opacity: [0, 1], scale: [0.96, 1] }, "-=400")
    .add(
      ".hero-card",
      { opacity: [0, 1], y: [32, 0] },
      stagger(CARD_STAGGER, { start: "-=300" })
    );
```

Controls: `tl.pause()`, `tl.seek(tl.duration)` (jump to end, used for reduced motion), `tl.reverse()`, `tl.restart()`. Nest with `parent.sync(childTl, position)`.

Loop a timeline seamlessly: `createTimeline({ loop: true, alternate: true, defaults: { ease: "inOutSine" } })`.

## 3. Scroll

### Scrub (progress tied to scroll)

```ts
import { animate, onScroll } from "animejs";

animate(".progress-bar", {
  scaleX: [0, 1],
  ease: "linear", // linear, or scrub will feel eased twice
  autoplay: onScroll({
    target: "article",
    enter: "top top", // '<container position> <target position>'
    leave: "bottom bottom",
    sync: true, // true = 1:1; 0.1 = smoothed; or an ease name
  }),
});
```

### Trigger (play once when entering view)

```ts
animate(".reveal", {
  y: [32, 0],
  opacity: [0, 1],
  delay: stagger(80),
  autoplay: onScroll({
    target: ".reveal-section",
    enter: "bottom 75%", // container bottom edge meets 75% down the target
    repeat: false, // once only
  }),
});
```

Default sync with no `sync` option is `'play pause'`: play on enter, pause on leave. Other method lists: `sync: "play reverse"`, `sync: "play pause resume reset"` (the third and fourth apply when scrolling backward).

### Link an observer to an existing animation / sticky sequence

```ts
const cards = animate(".card", {
  rotate: stagger([-30, 30]),
  delay: stagger(60, { from: "last" }),
  duration: 750,
});

onScroll({
  target: ".sticky-container",
  enter: "top",
  leave: "bottom",
  sync: 0.1,
}).link(cards);
```

Options: `container` (custom scroll container, default window), `axis` (`'x' | 'y'`), `enter` / `leave` (string `'container target'`, number px, or `{ container, target }`; keywords `top|bottom|left|right|start|end|center|min|max`, percentages, `px`, and `+=`/`-=`), `repeat`, `debug: true` (draws markers), `id`, callbacks `onEnter`, `onLeave`, `onEnterForward`, `onLeaveForward`, `onEnterBackward`, `onLeaveBackward`, `onUpdate`, `onResize`, `onSyncComplete`. Inside a `createScope`, observers are reverted with the scope.

## 4. SVG

```ts
import {
  animate,
  stagger,
  createDrawable,
  createMotionPath,
  morphTo,
} from "animejs";

// Line drawing. Target must be stroked: fill:none; stroke:currentColor
animate(createDrawable(".logo path"), {
  draw: ["0 0", "0 1", "1 1"], // [hidden, drawn, erased]
  delay: stagger(40),
  ease: "inOut(3)",
  duration: 2000,
  loop: true,
});

// Draw-on only
animate(createDrawable("path"), {
  draw: "0 1",
  duration: 1400,
  ease: "inOutQuad",
});

// Shape morph. Different point counts are handled; keep the same winding for the cleanest result
animate("#shape-a", {
  d: morphTo("#shape-b"),
  duration: 800,
  ease: "inOutQuad",
  alternate: true,
  loop: true,
});

// Motion path. createMotionPath returns translateX / translateY / rotate tween values
animate(".car", {
  ...createMotionPath(".circuit"),
  duration: 6000,
  ease: "linear",
  loop: true,
});
```

Notes:

- Inline the SVG in the DOM; `<img src>` SVG cannot be reached.
- `createDrawable` accepts selectors, elements, and arrays. It sets a normalized `pathLength` attribute on each shape, so no manual `getTotalLength()` is needed. Do not rely on the shape's own `pathLength` afterwards.
- For a motion-path element inside the same SVG, give it `transform-box: fill-box; transform-origin: center` so rotation pivots on itself.
- Animate any SVG attribute by name (`cx`, `r`, `points`, `stroke-width`, `fill`).

## 5. Text

```ts
import {
  animate,
  createTimeline,
  stagger,
  splitText,
  scrambleText,
} from "animejs";

// Split + effect. Effects re-run after resize re-splits lines.
const split = splitText(".headline", {
  lines: { wrap: "clip" }, // clip each line to mask a slide-up
  words: true,
  chars: false,
  // accessible: true (default) adds a visually hidden copy of the text and aria-hides the pieces
});

split.addEffect((s) =>
  animate(s.words, {
    y: ["100%", "0%"],
    opacity: [0, 1],
    duration: 700,
    ease: "out(4)",
    delay: stagger(40),
  })
);

// Cleanup: restores original HTML and tears down effects and the ResizeObserver
// split.revert();
```

`splitText` params: `lines`, `words`, `chars` each accept `true`, `false`, a template string with `{value}`, a function, or `{ class, wrap, clone }` (`wrap: true | 'hidden' | 'clip' | 'visible' | 'scroll' | 'auto'`; `clone: 'top' | 'right' | 'bottom' | 'left' | 'center'` creates a duplicate for rolling hover effects). Also `includeSpaces`, `accessible`, `debug`. The instance exposes `.lines`, `.words`, `.chars`, `.addEffect(fn)`, `.revert()`.

Splitting by lines waits for `document.fonts.ready`. If a font swap shifts layout, effects rebuild automatically.

### Scramble

```ts
animate(".status", {
  innerHTML: scrambleText({
    text: "Order confirmed", // omit to scramble back to the existing text
    chars: "A-Z0-9", // named sets: lowercase, uppercase, numbers, symbols, braille, blocks, shades; or ranges
    from: "left", // 'left' | 'center' | 'right' | 'random' | 'auto' | index
    cursor: true,
    settleDuration: 300,
  }),
});
```

`scrambleText` rewrites the element's text while it runs, so screen readers may announce the intermediate characters. Put the final text in an `aria-label` on a wrapper (and `aria-hidden="true"` on the scrambling node), or announce it in a live region from `onComplete`.

## 6. createAnimatable: cursor follow without re-creating animations

`animate()` per mousemove is wasteful. An animatable registers properties once and tweens toward each new value.

```ts
import { createAnimatable, utils } from "animejs";

const follower = createAnimatable(".cursor", {
  x: 400, // duration (ms) for this prop
  y: 400,
  rotate: { unit: "rad", duration: 0 }, // set instantly, no tween
  ease: "outElastic(.3, 1.4)",
});

const onMove = (event: PointerEvent) => {
  follower.x(utils.mapRange(event.clientX, 0, window.innerWidth, -200, 200));
  follower.y(event.clientY);
};
window.addEventListener("pointermove", onMove);
// cleanup: window.removeEventListener("pointermove", onMove); follower.revert();
```

Call `follower.x()` with no argument to read the current value.

## 7. Draggable

```ts
import { createDraggable, createSpring } from "animejs";

const SLIDE_WIDTH = 320;

const drag = createDraggable(".carousel-track", {
  x: { snap: SLIDE_WIDTH },
  y: false, // lock vertical
  container: ".carousel",
  releaseEase: createSpring({ stiffness: 120, damping: 14 }),
  cursor: { onHover: "grab", onGrab: "grabbing" },
  onSettle: (d) => setActiveIndex(Math.round(-d.x / SLIDE_WIDTH)),
});
```

Other options: `trigger` (drag handle), `modifier`, `containerPadding`, `containerFriction`, `releaseContainerFriction`, `dragSpeed`, `dragThreshold`, `scrollSpeed`, `minVelocity`, `maxVelocity`, `velocityMultiplier`, `releaseMass/Stiffness/Damping`. Callbacks: `onGrab`, `onDrag`, `onRelease`, `onUpdate`, `onSettle`, `onSnap`, `onResize`, `onAfterResize`. Instance methods: `setX(n)`, `setY(n)`, `stop()`, `reset()`, `enable()`, `disable()`, `scrollInView()`, `animateInView()`, `revert()`. Draggable is pointer-only, so add keyboard controls yourself (for example arrow keys calling `drag.setX(...)` or buttons that move to the next snap point) and respect `prefers-reduced-motion` for the release animation.

## 8. createLayout: DOM change transitions

`createLayout` records element positions, lets you mutate the DOM, then animates from old to new (FLIP, with enter/leave handling).

```ts
import { createLayout, createSpring } from "animejs";

const layout = createLayout(".accordion", {
  properties: ["background-color"], // extra CSS props to transition besides the defaults
  ease: createSpring({ bounce: 0.2, duration: 450 }),
  enterFrom: { opacity: 0, filter: "blur(5px)" },
  leaveTo: { opacity: 0, filter: "blur(5px)" },
});

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest(".accordion button");
  if (!button) return;
  layout.update(() => button.parentElement?.classList.toggle("is-open"));
});
```

Defaults: `duration: 350`, `ease: 'inOut(3.5)'`, tracked props include opacity, font size, colors, border radius, filter, clip-path. Options: `children` (selectors to track, default `'*'`), `swapAt`, `enterFrom`, `leaveTo`, `delay`. Manual form: `layout.record()`, mutate, `layout.animate()`. In React, mutate state inside `update()` is not enough, because React renders async. Use `flushSync` around the state change, or record before `setState` and call `animate()` in a `useLayoutEffect`.

## 9. WAAPI (native Web Animations, compositor-friendly)

```ts
import { waapi, stagger } from "animejs";

waapi.animate(".chip", {
  transform: ["translateY(12px)", "translateY(0px)"],
  opacity: [0, 1],
  duration: 400,
  delay: stagger(50),
  ease: "out(3)",
});
```

Same call shape as `animate()`, weighs about 3.5 KB, runs on the compositor for `transform`/`opacity`, and returns an instance with `.play()`, `.pause()`, `.reverse()`, `.seek()`, `.cancel()`, `.revert()`. It can be scroll-driven with `autoplay: onScroll({ sync: true })`. Use `waapi.convertEase(fn)` to turn a JS ease into a CSS `linear()` string. It only targets DOM elements, so plain-object and Three.js targets need `animate()`. Use it for simple DOM tweens and `animate()` for everything else.

## 10. Three.js adapter

```ts
import "animejs/adapters/three"; // side-effect import registers adapters
import { animate, createTimeline } from "animejs";

animate(mesh, {
  x: 2,
  rotateY: 360,
  scale: 1.2,
  color: "#ff00aa",
  duration: 1500,
  ease: "inOutQuad",
});
animate(camera, { fov: [50, 30], duration: 2000 });
animate(light, { intensity: [0, 2] });
```

Mapped props: `x/y/z`, `rotateX/Y/Z` (degrees, Euler order `XYZ`), `scale`, `scaleX/Y/Z`, `opacity`, `color`, `visible`; plus camera (`fov`, `zoom`, `near`, `far`) and light props. Unmapped names are matched against `mesh.material` (`metalness`, `roughness`, `emissive`, `wireframe`). Set `material.transparent = true` on anything that fades. Opacity 0 or scale 0 flips `visible = false`. For a render loop you own: `engine.useDefaultMainLoop = false;` then call `engine.update()` inside `renderer.setAnimationLoop`. Requires `three >= 0.150`.

## 11. Timer, engine, utils

```ts
import { createTimer, engine, utils } from "animejs";

const timer = createTimer({
  duration: 1000,
  loop: true,
  onLoop: () => refreshData(),
});
// timer has the same controls as animations: pause, resume, restart, seek, revert

engine.pauseOnDocumentHidden = true; // default
engine.speed = 1; // global playback rate
```

`utils` highlights: `utils.$('.sel')` (querySelectorAll to array), `utils.get(el, 'x')`, `utils.set(el, { x: 0, opacity: 1 })` (instant, no animation), `utils.remove(targets)` (stop animating these targets), `utils.random(min, max)`, `utils.randomPick(arr)`, `utils.shuffle(arr)`, `utils.round(decimals)` (chainable modifier), `utils.clamp`, `utils.snap`, `utils.wrap`, `utils.mapRange`, `utils.lerp`, `utils.damp`, `utils.degToRad`, `utils.radToDeg`, `utils.padStart`, `utils.roundPad`. Chain modifiers: `utils.round(0).clamp(0, 100)` can be passed as `modifier`.

`utils.set()` is the right way to apply a hidden initial state, e.g. `utils.set(".reveal", { opacity: 0, y: 24 })` inside the effect before the animation starts.
