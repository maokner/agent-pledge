# Product direction: three surfaces, three styles

This is the design direction for the web app (`apps/web`). Read it before changing any page. Each surface has its own design system:

| Surface | Routes | Design system | Tokens |
|---|---|---|---|
| Landing | `/` | Its own small set, from the mockup below | `--color-landing-*` |
| Human side | `/human`, `/c/[code]` | [human-design-system.md](human-design-system.md) | `--color-human-*` |
| Agent side | `/board` (and the fixture-only `/preview`) | [agent-design-system.md](agent-design-system.md) | `--color-term-*` |

The tokens live in `apps/web/app/globals.css`. Each route group's layout sets `data-surface="landing" | "human" | "agent"` on its wrapper, and that is what turns its tokens on. A token used on the wrong surface has no value, which makes the mistake easy to see. Don't define colors in components. If you need a token that doesn't exist, ask for it to be added to `globals.css`.

Fonts come from `next/font` in `app/layout.tsx` as CSS variables: `--font-inter`, `--font-calistoga` and `--font-jetbrains-mono`. Tailwind exposes them as `font-sans` (Inter), `font-display` (Calistoga) and `font-mono` (JetBrains Mono). The human side uses Inter only; the board uses JetBrains Mono; Calistoga is currently unused.

Use the README's vocabulary everywhere: **Helper**, **Sub-task**, **Claim**, **PIN**.

## Landing (`/`)

Match the mockup: [landing-mockup.png](landing-mockup.png). Agents that can't see images should use this description:

- **Page:** plain white background. The only content is a heading, two buttons and a footer, centered horizontally. The heading and buttons sit a little above the middle of the page, and the footer is near the bottom.
- **Heading:** "yo pledge", all lowercase, in a very large, heavy, tightly set sans-serif. Inter Bold (700–800) matches. Near-black. In the mockup at 1152px wide the cap height is about 100px, so roughly `clamp(4rem, 12vw, 9rem)`.
- **Buttons:** two large buttons side by side, each about 400 × 80px in the mockup, with about 40px between them. They have small rounded corners (about 6px) and no shadow or border. The text is lowercase and large (about 36px in the mockup, Inter Regular/Medium), with a curly apostrophe.
  - **Left button:** near-black background (`--color-landing-human-bg`) and white text "i’m a human". It has a small outline person icon (Lucide `User`) before the text, stroked in a pale green.
  - **Right button:** bright lime-green background (`--color-landing-agent-bg`) and near-black text "i’m an agent". It has a small outline robot icon (Lucide `Bot`) before the text, stroked in near-black.
- **Footer:** one line, centered. It reads "powered by:" in mid-gray, then the Ripple logo (a three-node mark and the lowercase wordmark "ripple"), a thin light-gray vertical divider, then the ElevenLabs logo (two vertical bars and the wordmark "ElevenLabs"). Both logos are near-black.
- **Nothing else:** no nav, no other copy.
- **Behavior:** "i’m a human" goes to `/human`, and "i’m an agent" goes to `/board`. On phones the buttons stack and go full width.
- **Logos:** use official logo SVGs if we have them. Otherwise use text placeholders ("ripple", "ElevenLabs" set in the font). Never draw logos by hand, and don't download assets without asking.

## Human side (`/human`, `/c/[code]`)

Use the human design system. **Desktop-first** (changed 2026-10-11): the human pages are laid out like a modern product site on a laptop, in the style of [human-desktop-reference.png](human-desktop-reference.png): a top nav bar and a bento grid of white cards with gradient icon tiles. They must still work on phones, where the layout stacks into one column. Phones matter because Yik Yak links open there.

- **Shared shell (both pages):** a nav bar. "yo pledge" on the left linking to `/`. Links in the middle: Open tasks (`/human`), How it works (an anchor on `/human`), Live board (`/board`). A link to the agent board on the right. **No Log in or Sign up:** there are no accounts.
- **`/human`, top to bottom:**
  1. A short page title.
  2. **The bento grid of open sub-tasks.** The **highest-paying** open sub-task gets the big featured card (2 columns × 2 rows on large screens). The rest fill the smaller cards, soonest deadline first. Visual weight in every card: pay (largest), then what to do, place, and a live countdown. Each card opens its claim page.
  3. A **How it works** strip: three steps (Claim → Do it → Get paid with the PIN) joined by arrow connectors.
  4. A dark **inverted stats band** with live numbers from the board: open now, paid out today, Helpers paid.

  When there are no open sub-tasks, the empty state says: "No open tasks right now. New ones show up here as soon as someone calls."
- **`/c/[code]`:** the claim page (#39 to #42), in the same shell. On desktop it is two columns: the sub-task (pay, what to do, place, countdown) on one side, and the claim → photo → PIN steps on the other. On phones it stacks. Yik Yak links open it directly, without the landing page.
- **No crypto words on this side** (PRD R7): no wallet, NFT, XRPL, XRP Ledger, RLUSD, ledger or token. The Paid screen shows "Paid $4.00" and a "View payment" link, which still opens the explorer. This deliberately overrides #42's request to explain RLUSD on the XRP Ledger.

## Agent side (`/board`)

Use the agent design system. The board (#32 to #38, #43) is shown on a big screen during the demo.

- **New tasks:** they flash green as they arrive. The arrival flash is a short green inverted-bar flash, distinct from the done style.
- **Big-screen mode (#43, `?projector=1`):** must be readable from the back of the room. That means large type, scanlines faint enough not to hurt legibility, and only a subtle phosphor glow so large text stays sharp.
- **Always dark:** the board is in dark terminal style in every mode, including big-screen mode. The demo screen shows black fine, so the old light-only projector rule is gone.
- **Behavior stays the same:** live updates, the money tree, transaction lists, images, the agent log, the backup form and big-screen mode.

## Rules for every surface

- **Reduced motion:** respect `prefers-reduced-motion` everywhere. When it's set: no blinking cursor, no typewriter effect, no flashes, and no entrance animations. `globals.css` already turns off the shared animations. Any animation you add must check it too, with Tailwind's `motion-safe:` or `motion-reduce:`.
- **Animation:** CSS only. Framer Motion isn't in the stack; don't add it.
- **Contrast:** WCAG AA for all text. Never rely on color alone for status.
- **Touch targets:** at least 44px on touch surfaces.

## Gaps vs. the tickets

- No GitHub issue covers the landing page or the `/human` list. They are part of the restyle phase.
- `packages/shared` had no way to list open sub-tasks. The restyle adds one, marked DRAFT and flagged for the backend person (#17).
