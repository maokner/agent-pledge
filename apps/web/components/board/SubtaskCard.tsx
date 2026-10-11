import type { LedgerTx, Subtask } from "@/lib/contract";
import { cn } from "@/lib/cn";
import { subtaskHolder } from "@/lib/board/selectors";
import { formatMinutes } from "@/lib/format";
import { failureText } from "@/lib/labels";
import { Fact, Facts } from "./Facts";
import { GLOW, LINK, WORK_BORDER } from "./term-style";
import { ExplorerLink, Money, Pane, SectionTitle, TimeLeft, Waiting, WorkStatusTag, ZoomableImage } from "./term";
import { TxList } from "./TxList";

/**
 * One sub-task, nested under its task (PRD 9.1): pay, time limit, status,
 * holder, the Yik Yak screenshot (step 9), the helper's photo (step 11), and
 * its own ledger transactions.
 */
export function SubtaskCard({ subtask, txs, names }: { subtask: Subtask; txs: LedgerTx[]; names: Map<string, string> }) {
  const active = subtask.status === "open" || subtask.status === "claimed";
  return (
    <Pane
      aria-label={`Sub-task: ${subtask.description}`}
      title="Sub-task // for a helper"
      headingLevel={3}
      className={cn("@container", WORK_BORDER[subtask.status])}
      right={
        <span className="flex items-baseline gap-3">
          <Money amount={subtask.price} className={cn("text-lg font-bold", GLOW)} />
          <WorkStatusTag status={subtask.status} />
        </span>
      }
    >
      <p className="text-lg font-bold wrap-anywhere">
        <span aria-hidden className="text-term-fg-dim">
          &gt;{" "}
        </span>
        {subtask.description}
      </p>

      <Facts>
        <Fact label="Pay">
          <Money amount={subtask.price} />
        </Fact>
        <Fact label="Time limit">{formatMinutes(subtask.time_limit_minutes)}</Fact>
        {active && (
          <Fact label="Time left">
            <TimeLeft deadline={subtask.deadline_at} limitMinutes={subtask.time_limit_minutes} className="font-bold" />
          </Fact>
        )}
        <Fact label="Held by">{subtaskHolder(subtask)}</Fact>
        <Fact label="Claim link">
          <a href={subtask.claim_url} className={LINK} target="_blank" rel="noopener noreferrer">
            /c/{subtask.claim_code}
          </a>
        </Fact>
        {subtask.nft_id && (
          <Fact label="Sub-task NFT">
            <ExplorerLink nft={subtask.nft_id} href={subtask.nft_explorer_url} />
          </Fact>
        )}
        {subtask.parent_nft_id && (
          <Fact label="Parent NFT">
            <ExplorerLink nft={subtask.parent_nft_id} />
          </Fact>
        )}
        {subtask.status === "claimed" && (
          <Fact label="PIN tries left">
            {subtask.pin_locked ? <span className="font-bold text-term-red">[ERR] LOCKED</span> : subtask.pin_attempts_left}
          </Fact>
        )}
      </Facts>

      {subtask.status === "failed" && failureText(subtask) && (
        <p className="mt-3 border border-term-red px-2 py-1 font-bold text-term-red">
          [ERR] FAILED: {failureText(subtask)}
        </p>
      )}

      <SubtaskMedia subtask={subtask} />

      <TxList txs={txs} names={names} title="Sub-task transactions" />
    </Pane>
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
        <figure key={post.screenshot_url}>
          <figcaption className="mb-1">
            <SectionTitle as="p">The Yik Yak post</SectionTitle>
          </figcaption>
          <ZoomableImage src={post.screenshot_url} alt={`Screenshot of the Yik Yak post: ${post.text}`} />
          <p className="mt-1 text-sm text-term-fg-dim wrap-anywhere">&quot;{post.text}&quot;</p>
        </figure>
      ) : (
        waitingForPost && <Waiting>Waiting for the Yik Yak post</Waiting>
      )}
      {photo ? (
        <figure key={photo.url}>
          <figcaption className="mb-1">
            <SectionTitle as="p">The helper&apos;s photo</SectionTitle>
          </figcaption>
          <ZoomableImage src={photo.url} alt={photo.note ? `The saved seat: ${photo.note}` : "The helper's photo of the saved seat"} />
          <p className={cn("mt-1 text-lg font-bold wrap-anywhere", GLOW)}>[OK] Seat saved{photo.note ? `: ${photo.note}` : ""}</p>
        </figure>
      ) : (
        waitingForPhoto && <Waiting>Waiting for the helper&apos;s photo</Waiting>
      )}
    </div>
  );
}
