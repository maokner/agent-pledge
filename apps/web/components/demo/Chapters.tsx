import { Camera, MessageSquare } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/human/Badge";
import { Card } from "@/components/human/Card";
import { cn } from "@/lib/cn";
import {
  amountLabel,
  CHAPTERS,
  chapterTxs,
  elapsedLabel,
  HELPER_PHOTO,
  SUBTASK,
  TX_COPY,
  txNumber,
  YIKYAK_POST,
  type Chapter,
  type LedgerTx,
} from "@/lib/demo/walkthrough";
import { ExplorerLink, SectionHeading, TypePill } from "./parts";
import { Screenshot } from "./Screenshot";

/**
 * The story in four chapters. Each one is the words on one side and the
 * screens on the other (sides alternate on large screens), with the chapter's
 * ledger transactions listed under the words so the story and the proof sit
 * together.
 */
export function Chapters() {
  return (
    <section
      id="story"
      aria-labelledby="story-title"
      className="scroll-mt-28 flex flex-col gap-16 lg:gap-24"
    >
      <SectionHeading
        id="story-title"
        badge="The story"
        title={
          <>
            Four chapters, <span className="text-human-gradient">three and a half minutes</span>
          </>
        }
        lede="From the first ledger close to the last. Each chapter lists the transactions that made it true."
      />
      {CHAPTERS.map((chapter) => (
        <ChapterBlock key={chapter.id} chapter={chapter} />
      ))}
    </section>
  );
}

function ChapterBlock({ chapter }: { chapter: Chapter }) {
  const flip = chapter.number % 2 === 0;
  const txs = chapterTxs(chapter);
  return (
    <article
      id={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className="scroll-mt-28 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12"
    >
      <div className={cn("flex flex-col gap-6 lg:col-span-5", flip && "lg:order-2")}>
        <div className="flex flex-col items-start gap-4">
          <Badge size="sm">{chapter.kicker}</Badge>
          <h3
            id={`${chapter.id}-title`}
            className="text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-balance sm:text-3xl lg:text-4xl"
          >
            {chapter.title}
          </h3>
        </div>
        <div className="flex flex-col gap-4 text-base leading-relaxed text-human-muted-fg lg:text-lg">
          {chapter.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <p className="border-l-4 border-human-accent pl-4 text-lg font-semibold leading-snug text-human-fg">
          {chapter.outcome}
        </p>
        <ChapterLedger txs={txs} />
      </div>

      <div className={cn("flex flex-col gap-6 lg:col-span-7", flip && "lg:order-1")}>
        <ChapterMedia chapter={chapter} />
      </div>
    </article>
  );
}

/** The chapter's transactions, compact: number, type, title, amount, link. */
function ChapterLedger({ txs }: { txs: LedgerTx[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
        On the ledger
      </h4>
      <ol className="divide-y divide-human-border overflow-hidden rounded-2xl border border-human-border bg-human-card shadow-human-sm">
        {txs.map((tx) => {
          const amount = amountLabel(tx);
          return (
            <li
              key={tx.hash}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-human-muted-fg">
                  {txNumber(tx)}
                </span>
                <TypePill type={tx.type} />
              </span>
              <span className="min-w-0 flex-1 text-base font-medium leading-snug">
                <a
                  href={`#tx-${txNumber(tx)}`}
                  className="rounded-sm outline-none hover:text-human-accent focus-visible:ring-2 focus-visible:ring-human-ring"
                >
                  {TX_COPY[tx.kind].title}
                </a>
              </span>
              <span className="flex items-center gap-4 sm:justify-end">
                {amount && (
                  <span className="text-base font-bold tabular-nums tracking-[-0.01em]">
                    {amount}
                  </span>
                )}
                <span className="text-sm tabular-nums text-human-muted-fg">
                  {elapsedLabel(tx.closeTime)}
                </span>
                <ExplorerLink href={tx.explorerUrl} className="min-h-0 text-sm">
                  Explorer
                </ExplorerLink>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** What each chapter shows next to its words. */
function ChapterMedia({ chapter }: { chapter: Chapter }) {
  const [first, ...rest] = chapter.shots;
  switch (chapter.id) {
    case "escrow":
      return first ? <Screenshot shot={first} priority /> : null;
    case "delegate":
      return (
        <>
          <YikYakCard />
          {first && <Screenshot shot={first} />}
        </>
      );
    case "claim":
      return (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
            {chapter.shots
              .filter((s) => s.frame === "phone")
              .map((shot) => (
                <Screenshot key={shot.src} shot={shot} />
              ))}
          </div>
          <HelperPhotoCard />
          {chapter.shots
            .filter((s) => s.frame === "browser")
            .map((shot) => (
              <Screenshot key={shot.src} shot={shot} />
            ))}
        </>
      );
    case "payout":
      return (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {chapter.shots
              .filter((s) => s.frame === "phone")
              .map((shot) => (
                <Screenshot key={shot.src} shot={shot} />
              ))}
          </div>
          {chapter.shots
            .filter((s) => s.frame === "browser")
            .map((shot) => (
              <Screenshot key={shot.src} shot={shot} />
            ))}
        </>
      );
    default:
      return (
        <>
          {first && <Screenshot shot={first} />}
          {rest.map((shot) => (
            <Screenshot key={shot.src} shot={shot} />
          ))}
        </>
      );
  }
}

/** The Yik Yak post as it went up, with its text. */
function YikYakCard() {
  return (
    <Card as="div" className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
      <Image
        src={YIKYAK_POST.src}
        alt={YIKYAK_POST.alt}
        width={YIKYAK_POST.width}
        height={YIKYAK_POST.height}
        sizes="(min-width: 640px) 320px, 100vw"
        className="w-full shrink-0 rounded-xl shadow-human-md sm:w-80"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
          <MessageSquare aria-hidden="true" className="size-4 text-human-accent" />
          The Yik Yak post
        </span>
        <blockquote className="text-lg leading-relaxed font-medium text-human-fg">
          “{SUBTASK.post_text}”
        </blockquote>
        <p className="text-sm leading-relaxed text-human-muted-fg">
          Posted by the agent at {SUBTASK.yikyak_posted_at.slice(11, 16)} UTC. The link is the claim
          page for code {SUBTASK.claim_code}; the agent rendered the post itself for this run.
        </p>
      </div>
    </Card>
  );
}

/** The helper's photo and note, as they landed on the board. */
function HelperPhotoCard() {
  return (
    <Card as="div" className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
      <Image
        src={HELPER_PHOTO.src}
        alt={HELPER_PHOTO.alt}
        width={HELPER_PHOTO.width}
        height={HELPER_PHOTO.height}
        sizes="(min-width: 640px) 320px, 100vw"
        className="w-full shrink-0 rounded-xl shadow-human-md sm:w-80"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
          <Camera aria-hidden="true" className="size-4 text-human-accent" />
          The helper’s photo
        </span>
        <blockquote className="text-lg leading-relaxed font-medium text-human-fg">
          “{SUBTASK.helper_note}”
        </blockquote>
        <p className="text-sm leading-relaxed text-human-muted-fg">
          Sent from the claim page at {SUBTASK.photo.created_at.slice(11, 16)} UTC, about{" "}
          {Math.round(
            (Date.parse(SUBTASK.photo.created_at) - Date.parse(SUBTASK.claimed_at)) / 1000,
          )}{" "}
          seconds after the claim. A placeholder photo for this run; the real demo uses the phone’s
          camera.
        </p>
      </div>
    </Card>
  );
}
