# Skill: ui-ux-pro-max

## Purpose

Design-system-first workflow for new bibaestudios storefront features: read the existing tokens, establish visual direction, then implement.

## Step 1 — Read the existing design system

There is no generator script. Extract tokens from the code that already exists, and reuse them:

- `apps/store/tailwind.config.mjs` — colors, fonts, spacing, radii (the `@medusajs/ui-preset` is applied here)
- `apps/store/src/styles/globals.css` — CSS variables and utility classes (`text-large-semi`, `content-container`, ...)
- `apps/store/src/cssVariables.js` — shared breakpoints and variables
- `@medusajs/ui` components used across `apps/store/src/modules/**`

Write down what you found (palette, type scale, spacing, shadows, radii) before designing anything new. Do not introduce new colors, fonts, or arbitrary Tailwind values when a token already exists.

## Step 2 — Establish visual direction (before coding)

Before writing a single component, answer:

| Question                | Decision                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| Primary visual metaphor | (e.g. "editorial lookbook", "quiet luxury", "everyday essentials")          |
| Color temperature       | Warm / Cool / Neutral                                                       |
| Density                 | Spacious / Balanced / Dense                                                 |
| Motion personality      | Subtle / Playful / None                                                     |
| Brand differentiation   | What makes this page feel like bibaestudios, not a generic fashion template |

## Step 3 — Composition hierarchy

Sketch the layout in text before code:

```
Hero: [campaign headline] [subline] [CTA] [lead image]
  → Reading flow: image and headline lead, one dominant element
  → CTA: high contrast, large target (min 44px)
  → Image: supports the message, does not compete with it

Section 2: [featured collection — 4 products]
  → Vary card size or crop for rhythm, price and name stay quiet
```

## Step 4 — Anti-generic rules

These patterns make a design feel generic — avoid them:

- ❌ Stock photo hero with text overlay
- ❌ Blue CTA button on white background (too safe)
- ❌ Product grid with identical card sizes and no visual rhythm
- ❌ "Learn more" or "Click here" as CTA text
- ❌ Gradient text without strong contrast ratio
- ❌ Emojis as icons (use the icon set already in the project)

## Step 5 — Handoff

After implementing: run the `impeccable/SKILL.md` audit before posting handoff.
