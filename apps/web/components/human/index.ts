/**
 * Components for the human side (/human and /c/[code]), in the human design
 * system (docs/design/human-design-system.md). They use the --color-human-*
 * tokens only, so they need a parent with data-surface="human" (the (human)
 * route group's layout sets it).
 *
 *   Button, buttonVariants   primary | secondary | ghost; size lg | md | sm; block; busy, icon, trailingArrow
 *   Card, CardTitle          default | muted | inverted | featured; padding md | sm | none; as
 *   Input, Textarea, Field   Input size lg | md | code (PIN); Field adds a label, "(optional)" and a hint
 *   Badge                    mono pill; tone accent | neutral | success | warning | danger | inverted; dot (true | "pulse")
 *   LiveDot                  pulsing dot; tone; pulse; label
 *   PayAmount                dollars in Calistoga; size hero | xl | lg | md | sm; tone default | gradient | inverted
 *   TimeLeft, Countdown      "2:31" from ms, or live to a deadline (with a server clock offset); red under a minute
 *   ProgressBar              0 to 1, gradient fill
 *   Notice                   danger | warning | success | info; title, action
 *   Spinner                  busy ring, still under reduced motion
 *   HumanHeader              name, "Fixture data" badge in fixture mode
 *
 * Copy on this side never uses crypto words (PRD R7); lib/claim/plain-words.test.ts
 * checks the strings in this folder.
 */
export { Badge, badgeVariants, type BadgeProps } from "./Badge";
export { Button, buttonVariants, type ButtonProps } from "./Button";
export { Card, CardTitle, cardVariants, type CardProps } from "./Card";
export { Countdown, TimeLeft, URGENT_MS } from "./Countdown";
export { HumanHeader } from "./HumanHeader";
export { Field, Input, inputVariants, Textarea, type InputProps } from "./Input";
export { LiveDot, type DotTone } from "./LiveDot";
export { Notice, noticeVariants, type NoticeProps } from "./Notice";
export { PayAmount, payAmountVariants, type PayAmountProps } from "./PayAmount";
export { ProgressBar } from "./ProgressBar";
export { Spinner } from "./Spinner";
