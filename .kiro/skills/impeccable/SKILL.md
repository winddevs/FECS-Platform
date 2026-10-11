# Skill: impeccable

## Purpose

Final production audit before handoff — accessibility, polish, performance, and ship-readiness.

## Run this checklist before every handoff

### Accessibility

- [ ] All images have descriptive `alt` text (or `alt=""` for decorative)
- [ ] Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text / UI components
- [ ] All interactive elements reachable by keyboard (Tab key)
- [ ] Focus ring visible on all interactive elements
- [ ] Form inputs have `<label>` or `aria-label`
- [ ] Error messages use `role="alert"` or `aria-live`
- [ ] No content only conveyed by color

### Layout & visual

- [ ] No layout shifts when content loads (images have width/height)
- [ ] Responsive at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] No text overflow on narrow viewports
- [ ] Loading states present for async content
- [ ] Empty states present (not blank white space)
- [ ] Error states present with recovery action

### Performance

- [ ] All images use `next/image` with correct `width`/`height`
- [ ] No new heavy dependencies added without bundle analysis
- [ ] Fonts are preloaded, not layout-shifting
- [ ] Animations use `transform`/`opacity` only (GPU compositing)
- [ ] No `will-change` on static elements

### Code quality

- [ ] No `console.log` or debug code in production paths
- [ ] No `eslint-disable` comments without explanation
- [ ] TypeScript — no `any` without explanation
- [ ] No hardcoded URLs, credentials, or magic strings
- [ ] `payload generate:types` run if Payload schema changed

### Cross-browser

- [ ] Tested in Chrome and Safari (Safari is the new IE for CSS)
- [ ] No `-webkit-` prefixes missing for CSS properties that need them

## Quick wins (do these first)

1. Run Lighthouse: `npx lighthouse https://localhost:3000 --view`
2. Run accessibility check: browser DevTools → Accessibility tab
3. Test with keyboard only — Tab through the entire page
