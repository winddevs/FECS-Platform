# Skill: taste-skill

## Purpose

Visual direction framework — establish composition, hierarchy, motion brief, and anti-generic rules before implementing.

## Composition principles

**Visual weight distribution:**

- Primary: one dominant element per viewport (hero headline, key metric, hero image)
- Secondary: supporting elements with ~60% visual weight of primary
- Tertiary: labels, metadata — visually quiet

**Whitespace:**

- Breathing room is a feature, not wasted space
- Minimum 24px between distinct content sections
- Hero sections: minimum 80px top/bottom padding

**Alignment:**

- Use a consistent grid (8-column or 12-column)
- Left-align body text in Vietnamese — center only for short headlines
- Avoid mixing left-aligned and center-aligned paragraphs in the same flow

## Hierarchy signals

Use exactly two of these per section to create emphasis (not all at once):

- Size contrast (large vs small)
- Color contrast (brand color vs neutral)
- Weight contrast (bold vs regular)
- Space contrast (tight vs loose)

## Motion brief format

Before implementing any animation, write a brief:

```
Element: [component name]
Trigger: [user interaction or page event]
Motion: [describe the movement — direction, distance, fade]
Duration: [e.g. 250ms]
Easing: [e.g. ease-out, spring(damping=20)]
Purpose: [feedback / delight / guidance / none — if none, remove animation]
```

## Anti-generic checklist

Before submitting any UI:

- [ ] Would this look identical on any SaaS site? If yes — add a distinctive touch
- [ ] Is the CTA text action-oriented? ("Mua bộ sưu tập mới" / "Shop the new collection" > "Learn more")
- [ ] Does the layout have visual rhythm? (Not all cards the same size)
- [ ] Is there at least one surprise moment per page? (Micro-interaction, unexpected color use, bold typographic choice)
