# Agent design system: Terminal CLI

For the agent side: `/board` and the fixture-only `/preview`. Read [DIRECTION.md](DIRECTION.md) first.

## Philosophy

An homage to the command line. Strip away the UI layer to show the system underneath. Brutally functional, high-contrast and authentically retro: cyber-industrial, hacker, system-level. Not Matrix rain; a clean, usable ZSH or Bash shell.

## Signatures

- **Monospace everything,** from the largest headline to the smallest label.
- **A blinking cursor** (a block or an underscore) as the heartbeat of the interface. It does not blink under reduced motion.
- **Shell metaphors:** prompts (`>`, `$`, `~`), flags (`--help`) and status codes (`[OK]`, `[ERR]`).
- **Faint CRT scanlines** for depth, never at the cost of readability.

## Tokens

The board is dark only, in every mode, including big-screen mode. Every token is defined in `apps/web/app/globals.css` under `[data-surface="agent"]`. Use the Tailwind utilities; never hard-code hex values in components.

| Token | Value | Tailwind | Use |
|---|---|---|---|
| background | #0a0a0a | `bg-term-bg` | page and panes |
| primary | #33ff00 | `text-term-fg` | primary text, cursor, active states (14.6:1) |
| dim text | #26b300 | `text-term-fg-dim` | inactive and secondary text (7.1:1, passes AA) |
| secondary | #ffb000 | `text-term-amber` | warnings and accents (10.8:1) |
| error | #ff3333 | `text-term-red` | errors and failures (5.4:1) |
| dim green | #1f521f | `border-term-line` | **borders and decoration only** |

**The dim-green rule:** #1f521f is only about 2:1 on black. Use it only for borders, separators, scanlines and decoration, never for body text or labels. Inactive text uses `text-term-fg-dim`.

**Glow:**
- `text-shadow-term-glow` is `0 0 5px rgba(51,255,0,0.5)`, for primary text in normal mode.
- In big-screen mode use `projector:text-shadow-term-glow-subtle` (`0 0 2px rgba(51,255,0,0.3)`) so large text stays sharp.

**Scanlines:** `term-scanlines` is a ready-made overlay class. It is `pointer-events-none`, very faint, and fainter still in big-screen mode.

## Board status map

The terminal palette is small, so every status comes with a text tag. Never rely on color alone. The status colors are tokens too:

| Status | Color token | Tag | Treatment |
|---|---|---|---|
| open | `term-status-open` (amber) | `[OPEN]` | amber text |
| claimed | `term-status-claimed` (green) | `[CLAIMED]` | green text |
| done | `term-status-done` (green) | `[DONE]` | **inverted block:** black text on a green fill |
| failed | `term-status-failed` (#ff3333) | `[ERR]` and the word FAILED | red text |
| pending tx | `term-status-pending` (amber) | `[..]` | amber, with a progress bar `[|||.....]` or a blinking cursor |
| validated tx | `term-status-validated` (green) | `[OK]` | green text |
| refund | `term-status-refund` (amber) | `[RFND] ↩` | amber, with a return arrow |

These are the Tailwind utilities: `text-term-status-open`, `bg-term-status-done` and so on.

**Arrival flash:** a new task's title bar flashes as a short inverted green bar (`animate-term-arrive`, about 0.8s). It is distinct from the done style, which stays inverted. There is no flash under reduced motion.

## Typography

- JetBrains Mono (`font-mono`) everywhere. The surface wrapper already sets it.
- Headers are ALL CAPS.
- Use a strict modular scale that snaps to the grid: `text-sm`, `text-base`, `text-lg`, `text-2xl` and `text-4xl`. Don't use arbitrary sizes.

## Shape

- **Radius:** 0px everywhere (`rounded-none`).
- **Borders:** 1px solid or dashed (`border-term-line`, or `border-term-fg` for emphasis). They define windows and panes.
- **Effects:** no drop shadows, only the phosphor glow.

## Components

### Buttons

Bracketed text like `[ VIEW TX ]`, or a solid block with inverted text.
- Hover: green fill with black text.
- Active: the text shifts down 1px.
- Focus: inverted colors (green fill, black text). No browser ring.

### Panes

A black box with a 1px border and a title bar, either `+--- INCOMING TASKS ---+` or a solid inverted bar, with padded monospace content inside.

### Inputs

- No box: a prompt like `agent@pledge:~$` followed by the field.
- The cursor is a blinking block cursor, which does not blink under reduced motion.
- No focus ring; show focus by inverting the prompt.
- The backup form (#38) uses this style.

### Progress

ASCII bars like `[||||||||....]` instead of charts or spinners.

### Icons

Lucide (`lucide-react`) with stroke width 2, always in the primary color.

## Layout

- A grid of terminal windows, like tmux or vim splits, aligned to a character grid.
- Use ASCII separators (`----`, `====`, `//`).
- Panes stack on mobile.
- Watch for monospace overflow: wrap long lines (hashes, addresses) and show a `\` continuation marker. Never scroll the page sideways.

## Bold factor

- An ASCII art logo in the header.
- A typewriter effect on headlines; under reduced motion the text appears at once.

## Animation

- **Allowed:** the blinking cursor (`animate-term-blink`), a subtle glitch offset on hover, the typing effect and the arrival flash.
- **Reduced motion:** all of these are off. `globals.css` cuts every animation short under reduced motion, and the blink's resting frame is "visible". Use `motion-safe:` for anything new.
- **Big-screen mode:** keep the scanlines faint and the glow subtle (see above).

## Accessibility

- Green on black passes AA. Dim text uses `term-fg-dim`, never `term-line`.
- Focus states use inverted colors.
- Every status has a text tag.
- Keep the roles and live regions the board already has (`role="log"`, status announcements).
