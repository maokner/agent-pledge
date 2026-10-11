import type { LedgerTx, Subtask } from "@agent-pledge/shared";
import { Countdown } from "@/components/ui/Countdown";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { ZoomableImage } from "@/components/ui/ZoomableImage";
import { subtaskHolder } from "@/lib/board/selectors";
import { formatMinutes } from "@/lib/format";
import { FAILURE_REASON_LABEL } from "@/lib/labels";
import { Fact, Facts } from "./Facts";
import { LiveStatusBadge, StatusGlow } from "./LiveStatus";
import { WORK_STATUS_STYLE } from "./status-style";
import { TxList } from "./TxList";

/**
 * One sub-task, nested under its task (PRD 9.1): pay, time limit, status,
 * holder, the Yik Yak screenshot (step 9), the helper's photo (step 11), and
 * its own ledger transactions.
 */
export function SubtaskCard({ subtask, txs, names }: { subtask: Subtask; txs: LedgerTx[]; names: Map<string, string> }) {
  const active = subtask.status === "open" || subtask.status === "claimed";
  return (
    <section
      aria-label={`Sub-task: ${subtask.description}`}
      className={`@container relative rounded-lg border border-l-8 border-zinc-200 p-4 dark:border-zinc-700 ${WORK_STATUS_STYLE[subtask.status].card}`}
    >
      <StatusGlow status={subtask.status} />
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Sub-task for a helper</p>
          <h3 className="text-lg font-semibold">{subtask.description}</h3>
        </div>
        <div className="flex items-center gap-3">
          <Money amount={subtask.price} className="text-2xl font-bold" />
          <LiveStatusBadge status={subtask.status} />
        </div>
      </header>

      <Facts>
        <Fact label="Pay">
          <Money amount={subtask.price} />
        </Fact>
        <Fact label="Time limit">{formatMinutes(subtask.time_limit_minutes)}</Fact>
        {active && (
          <Fact label="Time left">
            <Countdown deadline={subtask.deadline_at} className="font-semibold" />
          </Fact>
        )}
        <Fact label="Held by">{subtaskHolder(subtask)}</Fact>
        <Fact label="Claim link">
          <a href={subtask.claim_url} className="font-mono underline decoration-dotted underline-offset-2" target="_blank" rel="noopener noreferrer">
            /c/{subtask.claim_code}
          </a>
        </Fact>
        {subtask.nft_id && (
          <Fact label="Sub-task NFT">
            <ExplorerLink nft={subtask.nft_id} />
          </Fact>
        )}
        {subtask.parent_nft_id && (
          <Fact label="Parent NFT">
            <ExplorerLink nft={subtask.parent_nft_id} />
          </Fact>
        )}
        {subtask.status === "claimed" && (
          <Fact label="PIN tries left">
            {subtask.pin_locked ? <span className="font-semibold text-rose-700 dark:text-rose-300">Locked</span> : subtask.pin_attempts_left}
          </Fact>
        )}
      </Facts>

      {subtask.status === "failed" && subtask.failure_reason && (
        <p className="mt-3 rounded-md bg-rose-600 px-3 py-2 font-semibold text-white">{FAILURE_REASON_LABEL[subtask.failure_reason]}</p>
      )}

      <SubtaskMedia subtask={subtask} />

      <TxList txs={txs} names={names} title="Sub-task transactions" />
    </section>
  );
}

/** The Yik Yak screenshot and the helper's seat photo (demo steps 9 and 11), or what we are waiting for. */
function SubtaskMedia({ subtask }: { subtask: Subtask }) {
  const { yikyak_post: post, photo } = subtask;
  const waitingForPost = !post && subtask.status === "open";
  const waitingForPhoto = !photo && subtask.status === "claimed";
  if (!post && !photo && !waitingForPost && !waitingForPhoto) return null;

  return (
    <div className="mt-3 grid gap-4 @2xl:grid-cols-2">
      {post ? (
        <figure key={post.screenshot_url} className="motion-safe:animate-fade-in">
          <figcaption className="mb-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">The Yik Yak post</figcaption>
          <ZoomableImage src={post.screenshot_url} alt={`Screenshot of the Yik Yak post: ${post.text}`} />
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{post.text}</p>
        </figure>
      ) : (
        waitingForPost && <Waiting>Waiting for the Yik Yak post…</Waiting>
      )}
      {photo ? (
        <figure key={photo.url} className="motion-safe:animate-fade-in">
          <figcaption className="mb-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">The helper&apos;s photo</figcaption>
          <ZoomableImage src={photo.url} alt={photo.note ? `The saved seat: ${photo.note}` : "The helper's photo of the saved seat"} />
          <p className="mt-1 text-xl font-bold">Seat saved{photo.note ? `: ${photo.note}` : ""}</p>
        </figure>
      ) : (
        waitingForPhoto && <Waiting>Waiting for the helper&apos;s photo…</Waiting>
      )}
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-24 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-4 text-center text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
      {children}
    </p>
  );
}
