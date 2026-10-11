# Skill: web-animation-skills

## Purpose

Implementation patterns for UI animations — GSAP, CSS transitions, Framer Motion, Lottie, and SVG.

## Performance rules (non-negotiable)

- Animate only `transform` and `opacity` — these are GPU-composited and never trigger layout
- Never animate: `width`, `height`, `top`, `left`, `margin`, `padding` (causes reflow)
- Target 60fps — test on a mid-range device, not your MacBook
- Use `will-change: transform` sparingly — only on elements actively animating, remove after

## GSAP (for complex sequences)

```typescript
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

// Scroll-triggered fade-up
gsap.from(".card", {
  opacity: 0,
  y: 40,
  duration: 0.6,
  ease: "power2.out",
  stagger: 0.1,
  scrollTrigger: { trigger: ".cards-section", start: "top 80%" },
});
```

## Framer Motion (for React components)

```tsx
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

<motion.div
  variants={fadeUp}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true }}
>
  {children}
</motion.div>;
```

## CSS transitions (for simple state changes)

```css
.button {
  transition:
    background-color 150ms ease,
    transform 150ms ease;
}
.button:hover {
  background-color: var(--color-primary-700);
}
.button:active {
  transform: scale(0.97);
}
```

## Lottie (for illustration animations)

```tsx
import Lottie from "lottie-react";
import animationData from "@/assets/animations/success.json";

<Lottie
  animationData={animationData}
  loop={false}
  style={{ width: 120, height: 120 }}
/>;
```

## Accessibility

- Respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
    }
  }
  ```
- Never use animation as the sole means of conveying information

## Duration reference

| Purpose                            | Duration  |
| ---------------------------------- | --------- |
| Micro-interaction (button, toggle) | 100–200ms |
| Transition (modal, drawer)         | 200–350ms |
| Page enter animation               | 300–500ms |
| Scroll reveal                      | 400–600ms |
