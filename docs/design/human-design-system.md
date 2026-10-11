# Human design system: Minimalist Modern

For the human side: `/human` and `/c/[code]`. Read [DIRECTION.md](DIRECTION.md) first.

**Desktop-first, responsive down to phones** (changed 2026-10-11). Lay pages out like a modern product site on a laptop, using the reference screenshot [human-desktop-reference.png](human-desktop-reference.png). It has:
- a top nav bar with the logo on the left, links in the middle and actions on the right
- a bento grid of white, rounded, bordered cards. The first card is large and spans 2 columns × 2 rows; the smaller cards sit beside it and in a row below.
- a rounded-square gradient icon tile on each card (rounder and larger on the featured card), a semibold Inter title, and muted body text
- a "Learn more →"-style accent link at the bottom of the featured card
- generous whitespace and a faint accent glow in the page background

Hover effects are welcome on desktop: lift, deeper shadow, the icon scaling up, and a faint accent gradient overlay on cards. Nothing essential may depend on hover, because phones still use these pages. On phones everything stacks into one column with full-width buttons.

**Inter for all text** (changed 2026-10-11): titles, headlines, pay amounts, body, labels and badges. Calistoga and JetBrains Mono are not used on the human side.

## Philosophy

Clarity through structure, character through bold detail. Use few elements, each done with confidence. Whitespace directs attention, and color is concentrated into one electric accent. The tone is professional but design-forward: confident, sophisticated, alive, premium. Not sterile, generic, busy, flat or cold.

## Signature elements

- **Electric Blue gradient:** #0052FF → #4D7CFF. Use it on primary buttons, a key headline word as gradient text, icon backgrounds, featured card borders and badges.
- **Inverted contrast:** an occasional block in deep slate (#0F172A) with light text and a faint dot pattern, for emphasis.
- **Living details:** pulsing dots for "live", and shadows that deepen on press. Motion should feel natural, never decorative.
- **Fonts:**
  - Inter for everything: bold or semibold with tight tracking for titles and pay, regular for body.
  - Inter for everything else.
  - Small labels and badges are Inter too, uppercase with wide tracking.
- **Texture:** faint dot grids on dark blocks, soft accent glows and layered shadows instead of flat fills.

## Tokens

All of these are defined in `apps/web/app/globals.css` under `[data-surface="human"]`. Use the Tailwind utilities; never hard-code hex values in components.

| Token | Value | Tailwind |
|---|---|---|
| background | #FAFAFA | `bg-human-bg` |
| foreground | #0F172A | `text-human-fg` |
| muted | #F1F5F9 | `bg-human-muted` |
| muted-foreground | #64748B | `text-human-muted-fg` |
| accent | #0052FF | `bg-human-accent`, `text-human-accent` |
| accent-secondary | #4D7CFF | `…-human-accent-2` |
| accent-foreground | #FFFFFF | `text-human-accent-fg` |
| border | #E2E8F0 | `border-human-border` |
| card | #FFFFFF | `bg-human-card` |
| ring | #0052FF | `ring-human-ring` |
| inverted block | #0F172A | `bg-human-inverted` (text `text-human-inverted-fg`) |
| danger (added) | #B91C1C | `text-human-danger` |
| success (added) | #047857 | `text-human-success` |
| warning (added) | #B45309 | `text-human-warning` |

The danger, success and warning tokens were added for the claim page's states (wrong PIN, Time is up, Locked). They pass AA on the background and on cards.

- **Gradients:**
  - Decoration (borders, icon backgrounds, badges, large gradient text): `bg-human-gradient`, which is `linear-gradient(135deg, #0052FF, #4D7CFF)`.
  - Behind button text: `bg-human-gradient-button`, which is `linear-gradient(to right, #0052FF, #2E66FF)`.
- **Gradient text:** `text-human-gradient`, for one key word in a large headline only.

### Contrast rules

- **Primary button text:** white on #4D7CFF is only 3.72:1, so the button gradient is biased toward #0052FF and ends at #2E66FF. That keeps white text at 4.71:1 or better at any size.
  - Primary buttons use `bg-human-gradient-button`, never `bg-human-gradient`.
  - Their text is Inter 600 at 18px or larger.
- **Muted-foreground** (#64748B) is 4.56:1 on the background and 4.76:1 on cards, but only 4.34:1 on `muted` (#F1F5F9). Don't put small muted-foreground text on a `muted` fill.
- **Gradient text** is for large headlines only (24px+), where 3:1 is enough.

## Typography

- **Headlines and pay amounts:** Inter bold or semibold, tracking -0.02em, leading 1.05–1.15. One key word may use gradient text.
- **Card titles:** Inter 600, lg to 2xl, tracking -0.01em.
- **Body:** Inter 400, base to lg, line-height 1.625–1.75.
- **Labels:** Inter 12px, medium, uppercase, tracking 0.15em, inside a pill badge.

## Layout

- On phones: a single column with 16–20px side padding.
- On larger screens: the container is `max-w-6xl` at most. The claim page and list stay narrow (`max-w-md` to `max-w-lg`), centered.
- Leave generous space between sections and keep spacing tighter inside components. Grid gaps are `gap-5` to `gap-8`.

## Surfaces and shadows

White cards with a 1px border, `rounded-xl` or `rounded-2xl`.

| Shadow | Value | Tailwind |
|---|---|---|
| sm | 0 1px 3px rgba(0,0,0,0.06) | `shadow-human-sm` |
| md | 0 4px 6px rgba(0,0,0,0.07) | `shadow-human-md` |
| lg | 0 10px 15px rgba(0,0,0,0.08) | `shadow-human-lg` |
| xl | 0 20px 25px rgba(0,0,0,0.1) | `shadow-human-xl` |
| accent | 0 4px 14px rgba(0,82,255,0.25) | `shadow-human-accent` |
| accent-lg | 0 8px 24px rgba(0,82,255,0.35) | `shadow-human-accent-lg` |

A featured element gets a 2px gradient border: a gradient outer div with a white inner div.

## Components

Build them locally in `apps/web/components/human/` in the shadcn style. Use `class-variance-authority` for variants and `cn()` from `apps/web/lib/cn.ts` (clsx + tailwind-merge). Match the existing repo patterns.

### Buttons

All buttons use `transition-all duration-200`.

- **Primary:**
  - Base: `bg-human-gradient-button`, white Inter 600 text at 18px+, `rounded-xl`, `shadow-human-sm`, height `h-12` to `h-14`, full width on mobile.
  - Hover (desktop only, never essential): lift `-translate-y-0.5`, `shadow-human-accent-lg`, `brightness-110`, and an arrow icon that slides right.
  - Active: `scale-[0.98]`.
- **Secondary:** transparent background, 1px `border-human-border` border, foreground text. Hover: `bg-human-muted`, with the border at accent/30.
- **Ghost:** no background or border, muted-foreground text that turns foreground on hover.
- **Disabled and busy:** keep the label readable and show a spinner or progress text. Never just fade the button out.

### Cards

- White background, 1px border, `rounded-xl` or `rounded-2xl`, `shadow-human-md`, padding `p-5` on phones and `p-6` to `p-10` on larger screens.
- **Hover (desktop):** `shadow-human-xl`, a lift, and a faint accent overlay (`bg-human-card-glow`, faded in). On the featured card, add a soft corner glow (`bg-human-corner-glow`).
- **Icon tiles:** a rounded square with `bg-human-gradient` and a white Lucide icon. 56px on small cards, 72–88px with a larger radius on the featured card. On card hover the tile scales up a little.

### Inputs

- Height `h-12` to `h-14`, 1px border, `rounded-lg` or `rounded-xl`, text at least 16px (so iOS doesn't zoom the page).
- Focus: `ring-2 ring-human-ring ring-offset-2`.
- Placeholder: muted-foreground at 50%.

### Badge

- A `rounded-full` pill with an accent/30 border, accent/5 background and `px-5 py-2` padding.
- A small accent dot, which may pulse.
- Label text: Inter xs, medium, uppercase, tracking 0.15em, accent color.

### Live dot

- An accent dot with `animate-human-pulse`: a 2s loop that scales from 1 to 1.3 and fades from 1 to 0.7 opacity.
- It stops under reduced motion.

## Motion

- **Easing:** `ease-human`, which is `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Entrances:** `animate-human-fade-up` fades up 28px over 0.7s. Stagger items 0.1s with `animation-delay`.
- **Hover transitions:** 200–300ms.
- **Continuous (decorative only, desktop only, `motion-safe:`):** `animate-human-float` bobs an element 10px over 5s, and `animate-human-spin-slow` turns a decorative ring once a minute.
- **No Framer Motion:** it isn't in the stack. Use CSS animations only.
- **Reduced motion:** when `prefers-reduced-motion` is set there are no entrance animations, no pulsing and no flashes. `globals.css` cuts every animation short under reduced motion; still use `motion-safe:` for anything you add.

## Responsive and accessibility

- Touch targets are 44px or more; primary buttons are `h-12` to `h-14`.
- Buttons are full width on mobile.
- Decorative elements are hidden on small screens.
- All text meets WCAG AA contrast.
- Focus rings are visible.
- Nothing flashes.
- **No crypto words** (see DIRECTION.md): no wallet, NFT, XRPL, XRP Ledger, RLUSD, ledger or token.
